/**
 * ArchSim simulation engine.
 * Pure + deterministic: no React, no DOM. One call to `step` = one tick.
 *
 * Model (teaching approximation, see ASSUMPTIONS):
 *  - Traffic is a fluid of read/write requests per second flowing along edges in topological order.
 *  - Each node has a capacity; utilisation u = load / capacity. Overload drops the excess.
 *  - Service latency grows like M/D/1 queueing: base × (1 + u / (2(1 − u))).
 *  - "split" edges share traffic by weight among healthy targets (automatic failover);
 *    "all" edges receive every request (fan-out / sequential dependency).
 *  - Queues decouple: producers see only the enqueue latency; backlog grows when consumers lag.
 */
import { ARM_FACTOR, CATALOG, PRICING_FACTOR, SIZES, SPOT_CAPACITY } from './catalog'
import { GLOBAL, getLocation, rttMs } from './regions'
import type {
  Chaos, EdgeMetrics, GraphEdge, GraphNode, NodeConfig, NodeMetrics, Pattern, Runtime, SimEdgeData, SimResult,
} from './types'

export const SECONDS_PER_MONTH = 2_628_000
const DAY = 86_400
const MAX_LAT = 5000

export const ASSUMPTIONS: string[] = [
  'Network RTT ≈ 1 ms per 100 km of great-circle distance + 2 ms; same region ≈ 0.5 ms; users add 5 ms last-mile.',
  'Service latency follows M/D/1 queueing: base × (1 + u ÷ (2 × (1 − u))), where u is utilisation. Above 100 % the excess is dropped and the rest times out slowly.',
  'p99 per hop ≈ base × (1.5 + 2u/(1−u)). Along a path the means add and the tails combine like variances; a cache with ≥ 1 % misses puts the miss path into the p99.',
  '"Split" edges share load by weight among healthy targets — health checks give automatic failover. "Every request" edges are sequential calls.',
  'Caches and CDNs absorb their hit rate of reads; writes and misses continue downstream (write-through).',
  'Queues acknowledge instantly; consumer errors do not reach the user, but backlog age grows when workers fall behind.',
  'Costs are on-demand list-price ballparks (2026) at the current request rate, projected to a 730-hour month.',
  'Egress to users is tiered ($0.09 → $0.05/GB) and billed at the first regional node users reach; CDN bandwidth is tiered ($0.085 → $0.025/GB); cross-region hops $0.02/GB.',
  'GeoDNS and CDNs route each user location to the nearest healthy regional target when they have several.',
  'An AZ outage halves self-managed fleets of 2+ instances, kills single instances, and kills SQL without Multi-AZ or a replica. Managed services survive.',
  'Retries multiply load on a struggling target by 1 + q + q² … (q = its failure rate last tick) — the classic retry storm. A circuit breaker suppresses retries while a target is below 90 % success and stops calling it entirely once it is dead (fail fast / fail over).',
  'Stream processors write downstream in batches of 100 events (files, bulk inserts) — that is what makes firehoses affordable.',
  'Reserved pricing discounts the committed baseline (min instances) by 40 %; spot is 70 % off with ~8 % capacity lost to reclaims; ARM is 20 % cheaper.',
]

export const DEFAULT_EDGE: SimEdgeData = { mode: 'split', filter: 'any', weight: 1 }

export function patternFactor(p: Pattern, timeOfDay: number): number {
  const h = timeOfDay / 3600
  switch (p) {
    case 'steady':
      return 1
    case 'daily': {
      // trough ~04:00 (0.3), peak ~16:00 (1.0)
      const phase = ((h - 4) / 24) * 2 * Math.PI
      return 0.3 + 0.7 * (0.5 - 0.5 * Math.cos(phase))
    }
    case 'spike':
      return h >= 12 && h < 12.5 ? 6 : 1
    case 'growth':
      return 0.5 + 2 * (h / 24)
  }
}

export const timeOfDay = (t: number) => ((t % DAY) + DAY) % DAY

export function nodeCapacity(cfg: NodeConfig, kind: GraphNode['data']['kind'], instances: number, azDown = false) {
  const def = CATALOG[kind]
  const mult = SIZES[cfg.size]?.mult ?? 1
  const spot = def.pricingLevers && cfg.pricing === 'spot' ? SPOT_CAPACITY : 1
  // losing one AZ takes out roughly half of a fleet spread over two zones
  const azF = azDown && def.scalable && kind !== 'sql' ? 0.5 : 1
  const both = (c: number) => ({ read: c, write: c })
  switch (kind) {
    case 'sql': {
      const shards = Math.max(1, cfg.shards)
      let readers = 1 + cfg.replicas
      if (azDown && !cfg.multiAz && cfg.replicas > 0) readers = cfg.replicas // a replica was promoted
      return {
        read: def.baseCap * mult * readers * shards * spot,
        write: (def.baseWriteCap ?? def.baseCap) * mult * shards * spot,
      }
    }
    case 'nosql':
    case 'globaldb':
      return { read: (def.baseCap * Math.max(1, cfg.shards)) / 4, write: ((def.baseWriteCap ?? 0) * Math.max(1, cfg.shards)) / 4 }
    case 'storage':
      return { read: def.baseCap, write: def.baseWriteCap ?? def.baseCap }
    case 'warehouse':
      return { read: def.baseCap * mult * Math.max(0, instances) * azF * spot, write: (def.baseWriteCap ?? 0) * Math.max(1, instances) }
    case 'stream': {
      const c = def.baseCap * Math.max(1, cfg.shards)
      return { read: c * 2, write: c }
    }
    case 'serverless':
      return both(Math.max(1, cfg.rateLimit) * (1000 / Math.max(1, cfg.latencyMs)))
    case 'external':
    case 'notify':
      return both(Math.max(1, cfg.rateLimit))
    default:
      return both(def.scalable ? def.baseCap * mult * Math.max(0, instances) * spot * azF : def.baseCap)
  }
}

/** monthly $ for instance-hour priced components, honouring reserved / spot / ARM */
export function instanceCost(kind: GraphNode['data']['kind'], cfg: NodeConfig, units: number, baseline: number): number {
  const def = CATALOG[kind]
  const size = SIZES[cfg.size] ?? SIZES.S
  let hourly = size.hourly * (def.priceMult ?? 1)
  if (def.armCapable && cfg.arch === 'arm') hourly *= ARM_FACTOR
  const pricing = def.pricingLevers ? cfg.pricing : 'ondemand'
  let eff: number
  if (pricing === 'spot') eff = units * PRICING_FACTOR.spot
  else if (pricing === 'reserved') eff = Math.min(units, baseline) * PRICING_FACTOR.reserved + Math.max(0, units - baseline)
  else eff = units
  return eff * hourly * 730
}

function ownLatency(base: number, u: number): { mean: number; p99: number } {
  if (u >= 1) {
    const mean = Math.min(MAX_LAT, base * 20 + 250 * Math.min(u, 4))
    return { mean, p99: Math.min(MAX_LAT, mean * 3 + 500) }
  }
  const uu = Math.min(u, 0.97)
  // M/D/1-ish: waiting time grows with u/(1-u)
  return { mean: base * (1 + uu / (2 * (1 - uu))), p99: Math.min(MAX_LAT, base * (1.5 + (2 * uu) / (1 - uu))) }
}

/** Tiered per-GB price: [tierGB, price] pairs, last tier open-ended. */
function tiered(gb: number, tiers: [number, number][]): number {
  let left = gb
  let cost = 0
  for (const [size, price] of tiers) {
    const take = Math.min(left, size)
    cost += take * price
    left -= take
    if (left <= 0) break
  }
  return cost
}
const INTERNET_TIERS: [number, number][] = [[10_240, 0.09], [40_960, 0.085], [102_400, 0.07], [Infinity, 0.05]]
const CDN_TIERS: [number, number][] = [[10_240, 0.085], [40_960, 0.08], [102_400, 0.06], [358_400, 0.04], [Infinity, 0.025]]

export interface StepInput {
  nodes: GraphNode[]
  edges: GraphEdge[]
  chaos: Chaos
  runtime: Runtime
  time: number // absolute sim seconds
  dt: number // sim seconds advanced this tick (0 when paused)
}

export interface StepOutput {
  result: SimResult
  runtime: Runtime
}

type Flow = { r: number; w: number }

export function step(input: StepInput): StepOutput {
  const { nodes, edges, chaos, time, dt } = input
  const runtime: Runtime = {
    instances: { ...input.runtime.instances },
    cooldown: { ...input.runtime.cooldown },
    backlog: { ...input.runtime.backlog },
    prevSuccess: { ...(input.runtime.prevSuccess ?? {}) },
  }
  const warnings: string[] = []
  const tod = timeOfDay(time)

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const validEdges = edges.filter((e) => byId.has(e.source) && byId.has(e.target) && e.source !== e.target)
  const outE = new Map<string, GraphEdge[]>()
  const inDeg = new Map<string, number>()
  nodes.forEach((n) => {
    outE.set(n.id, [])
    inDeg.set(n.id, 0)
  })
  validEdges.forEach((e) => {
    outE.get(e.source)!.push(e)
    inDeg.set(e.target, (inDeg.get(e.target) ?? 0) + 1)
  })

  // Kahn topological order; leftovers are in cycles
  const order: string[] = []
  const deg = new Map(inDeg)
  const queue = nodes.filter((n) => deg.get(n.id) === 0).map((n) => n.id)
  while (queue.length) {
    const id = queue.shift()!
    order.push(id)
    for (const e of outE.get(id)!) {
      deg.set(e.target, deg.get(e.target)! - 1)
      if (deg.get(e.target) === 0) queue.push(e.target)
    }
  }
  if (order.length < nodes.length) {
    warnings.push('Cycle detected — edges that loop back are ignored by the simulation.')
    nodes.forEach((n) => !order.includes(n.id) && order.push(n.id))
  }
  const rank = new Map(order.map((id, i) => [id, i]))
  const isBack = (e: GraphEdge) => rank.get(e.target)! <= rank.get(e.source)!

  const failedNodes = new Set(chaos.failedNodes)
  const failedRegions = new Set(chaos.failedRegions)
  const failedAZs = new Set(chaos.failedAZs ?? [])
  const cut = new Set(chaos.cutEdges)
  const effInstances = (n: GraphNode) => {
    const c = n.data.config
    const d = CATALOG[n.data.kind]
    if (!(d.autoscalable && c.autoscale)) return c.instances
    return Math.min(Math.max(runtime.instances[n.id] ?? c.instances, c.minInstances), Math.max(c.minInstances, c.maxInstances))
  }
  const azHit = (n: GraphNode) => n.data.kind !== 'client' && n.data.config.region !== GLOBAL && failedAZs.has(n.data.config.region)
  /** a zone outage kills single-instance self-managed things and single-AZ databases */
  const azKills = (n: GraphNode) => {
    if (!azHit(n)) return false
    const d = CATALOG[n.data.kind]
    if (n.data.kind === 'sql') return !n.data.config.multiAz && n.data.config.replicas === 0
    return !!d.scalable && effInstances(n) < 2
  }
  const isFailed = (id: string) => {
    const n = byId.get(id)
    if (!n) return true
    if (failedNodes.has(id)) return true
    if (n.data.kind !== 'client' && n.data.config.region !== GLOBAL && failedRegions.has(n.data.config.region)) return true
    return azKills(n)
  }
  const edgeUsable = (e: GraphEdge) => !cut.has(e.id) && !isFailed(e.target) && !breakerOpen(e)
  const ed = (e: GraphEdge) => e.data ?? DEFAULT_EDGE
  const prevS = (id: string) => Math.min(1, Math.max(0, runtime.prevSuccess[id] ?? 1))
  /** breaker fully open: the target is dead, stop calling it so traffic fails over / fails fast */
  const breakerOpen = (e: GraphEdge) => !!ed(e).breaker && prevS(e.target) < 0.05
  /** breaker half-open: the target is struggling, so retries are suppressed */
  const breakerTripped = (e: GraphEdge) => !!ed(e).breaker && prevS(e.target) < 0.9
  /** expected attempts per request with retries, given the target's recent success rate */
  const attempts = (e: GraphEdge, s: number) => {
    if (breakerTripped(e)) return 1
    const k = Math.max(0, Math.min(5, ed(e).retries ?? 0))
    const q = 1 - Math.min(1, Math.max(0, s))
    let a = 0
    for (let i = 0; i <= k; i++) a += q ** i
    return a
  }
  const retriedSuccess = (e: GraphEdge, s: number) => {
    if (breakerOpen(e)) return 0
    const sc = Math.min(1, Math.max(0, s))
    if (breakerTripped(e)) return sc
    const k = Math.max(0, Math.min(5, ed(e).retries ?? 0))
    return 1 - (1 - sc) ** (k + 1)
  }
  const extraIn = new Map<string, number>()

  // ---------- forward pass: load ----------
  const inflow = new Map<string, Flow>(nodes.map((n) => [n.id, { r: 0, w: 0 }]))
  const origins = new Map<string, Map<string, number>>() // global nodes: location -> rps
  const metrics: Record<string, NodeMetrics> = {}
  const edgeM: Record<string, EdgeMetrics> = {}
  const passR = new Map<string, number>()
  const edgeFlow = new Map<string, Flow>(validEdges.map((e) => [e.id, { r: 0, w: 0 }]))
  const ownS = new Map<string, Flow>()
  const ownLat = new Map<string, { r: number; w: number; pr: number; pw: number }>()
  let payloadSum = 0
  let payloadW = 0

  validEdges.forEach((e) => {
    edgeM[e.id] = { rps: 0, errRate: 0, latencyMs: 0, healthy: !cut.has(e.id) && !isFailed(e.target), back: isBack(e) }
  })

  const addOrigin = (target: string, loc: string, rps: number) => {
    if (rps <= 0) return
    let m = origins.get(target)
    if (!m) origins.set(target, (m = new Map()))
    m.set(loc, (m.get(loc) ?? 0) + rps)
  }

  for (const id of order) {
    const n = byId.get(id)!
    const { kind, config: cfg } = n.data
    const def = CATALOG[kind]
    const inF = inflow.get(id)!
    let out: Flow = { r: 0, w: 0 }
    const failed = isFailed(id)

    // instances (autoscaling runtime)
    const inst = effInstances(n)
    const azDown = azHit(n) && !failed

    const m: NodeMetrics = {
      inRead: inF.r, inWrite: inF.w, servedRps: 0, droppedRps: 0, throttledRps: 0, util: 0, capacity: 0,
      instances: inst, latency: 0, p99: 0, cost: 0, egressCost: 0, healthy: !failed, success: 1,
      azDegraded: azDown || undefined,
    }

    if (kind === 'client') {
      const total = (cfg.users * cfg.reqPerUserMin) / 60 * patternFactor(cfg.pattern, tod) * chaos.trafficMult
      out = { r: total * cfg.readRatio, w: total * (1 - cfg.readRatio) }
      m.offered = total
      m.servedRps = total
      payloadSum += total * cfg.payloadKB
      payloadW += total
      ownS.set(id, { r: 1, w: 1 })
      ownLat.set(id, { r: 0, w: 0, pr: 0, pw: 0 })
      passR.set(id, 1)
    } else {
      const total = inF.r + inF.w
      const cap = nodeCapacity(cfg, kind, inst, azDown)
      let sR = 1
      let sW = 1
      let u = 0
      if (failed) {
        sR = sW = 0
        u = 0
      } else if (kind === 'ratelimiter') {
        const allowed = total > 0 ? Math.min(1, cfg.rateLimit / total) : 1
        sR = sW = allowed
        m.throttledRps = total * (1 - allowed)
        u = total / Math.max(1, cfg.rateLimit)
      } else {
        const uR = cap.read > 0 ? inF.r / cap.read : inF.r > 0 ? Infinity : 0
        const uW = cap.write > 0 ? inF.w / cap.write : inF.w > 0 ? Infinity : 0
        const sep = cap.read !== cap.write
        u = sep ? Math.max(uR, uW) : cap.read > 0 ? total / cap.read : total > 0 ? Infinity : 0
        if (sep) {
          sR = uR > 1 ? 1 / uR : 1
          sW = uW > 1 ? 1 / uW : 1
        } else {
          sR = sW = u > 1 ? 1 / u : 1
        }
      }
      if (!Number.isFinite(u)) u = 99
      m.util = u
      m.capacity = cap.read === cap.write ? cap.read : cap.read + cap.write
      m.servedRps = inF.r * sR + inF.w * sW
      if (kind !== 'ratelimiter') m.droppedRps = total - m.servedRps
      ownS.set(id, { r: sR, w: sW })

      // latency
      const base = Math.max(0.1, cfg.latencyMs)
      const lr = ownLatency(base, kind === 'ratelimiter' ? 0 : u)
      let lrr = lr
      let lw = lr
      if (kind === 'sql') lw = ownLatency(base * 2.5, u)
      else if (kind === 'nosql') {
        if (cfg.consistency === 'strong') lrr = ownLatency(base * 1.3, u)
        lw = ownLatency(base * 1.5, u)
      } else if (kind === 'globaldb') {
        const cw = ownLatency(base * 1.5, u)
        const consensus = cfg.consistency === 'strong' ? 60 : 8
        lw = { mean: cw.mean + consensus, p99: cw.p99 + consensus * 1.5 }
      } else if (kind === 'warehouse') lw = ownLatency(20, u)
      let coldMean = 0
      let coldP99 = 0
      if (kind === 'serverless') {
        coldMean = 0.03 * 300
        coldP99 = 300
      }
      ownLat.set(id, { r: lrr.mean + coldMean, w: lw.mean + coldMean, pr: lrr.p99 + coldP99, pw: lw.p99 + coldP99 })
      m.latency = (inF.r * (lrr.mean + coldMean) + inF.w * (lw.mean + coldMean)) / Math.max(1e-9, total) || lrr.mean
      m.p99 = Math.max(lrr.p99, lw.p99) + coldP99

      // pass-through
      let pass = 1
      if (kind === 'cache' || kind === 'cdn' || kind === 'edgefn') {
        let hit = cfg.hitRate
        const flushed = chaos.flushedCaches[id]
        if (flushed !== undefined) hit *= Math.min(1, Math.max(0, (time - flushed) / 600))
        m.effectiveHit = hit
        pass = 1 - hit
      }
      if (def.terminal) pass = 0
      passR.set(id, pass)
      // stream processors aggregate: downstream sees one write per batch of 100 events
      const batch = kind === 'streamproc' ? 0.01 : 1
      out = { r: inF.r * sR * pass * batch, w: inF.w * sW * (def.terminal ? 0 : 1) * batch }

      // queues: consumers drain at their capacity
      if (def.async && kind !== 'pubsub') {
        const consumers = (outE.get(id) ?? []).filter((e) => !isBack(e) && edgeUsable(e))
        let consumerCap = consumers.length ? 0 : Infinity
        for (const e of consumers) {
          const t = byId.get(e.target)!
          const td = CATALOG[t.data.kind]
          if (td.scalable || t.data.kind === 'serverless' || t.data.kind === 'external' || t.data.kind === 'notify') {
            const c = nodeCapacity(t.data.config, t.data.kind, effInstances(t), azHit(t))
            consumerCap += td.terminal ? c.write : c.read
          } else consumerCap = Infinity
        }
        if ((outE.get(id) ?? []).length > 0 && consumers.length === 0) consumerCap = 0
        const produced = out.r + out.w
        const backlog = runtime.backlog[id] ?? 0
        const want = produced + (dt > 0 ? backlog / dt : 0)
        const drained = Math.min(want, consumerCap)
        const newBacklog = Math.max(0, backlog + (produced - drained) * dt)
        runtime.backlog[id] = newBacklog
        m.backlog = newBacklog
        m.backlogAgeSec = Number.isFinite(consumerCap) && consumerCap > 0 ? newBacklog / consumerCap : newBacklog > 0 ? Infinity : 0
        const scale = produced > 0 ? drained / produced : 0
        out = produced > 0 ? { r: out.r * scale, w: out.w * scale } : { r: 0, w: dt > 0 ? drained : 0 }
        if (produced === 0 && dt === 0) out = { r: 0, w: backlog > 0 && Number.isFinite(consumerCap) ? consumerCap : 0 }
      }

      // autoscaling
      if (def.autoscalable && cfg.autoscale && dt > 0 && !failed) {
        const until = runtime.cooldown[id] ?? -Infinity
        if (time >= until) {
          const max = Math.max(cfg.minInstances, cfg.maxInstances)
          if (u > 0.75 && inst < max) {
            runtime.instances[id] = Math.min(max, Math.ceil(inst * Math.min(u, 4) / 0.6))
            runtime.cooldown[id] = time + 120
          } else if (u < 0.35 && inst > cfg.minInstances) {
            runtime.instances[id] = Math.max(cfg.minInstances, Math.max(Math.ceil(inst * u / 0.6), Math.floor(inst / 2)))
            runtime.cooldown[id] = time + 300
          } else runtime.instances[id] = inst
        } else runtime.instances[id] = inst
      }
    }

    // propagate origins
    const myLocs: Map<string, number> =
      kind === 'client'
        ? new Map([[cfg.region, out.r + out.w]])
        : cfg.region === GLOBAL
          ? (origins.get(id) ?? new Map())
          : new Map([[cfg.region, out.r + out.w]])

    // distribute outflow
    const outs = (outE.get(id) ?? []).filter((e) => !isBack(e))
    for (const cls of ['r', 'w'] as const) {
      const amount = out[cls]
      if (amount <= 0) continue
      const elig = outs.filter((e) => ed(e).filter === 'any' || ed(e).filter === (cls === 'r' ? 'read' : 'write'))
      const all = elig.filter((e) => ed(e).mode === 'all')
      const split = elig.filter((e) => ed(e).mode !== 'all')
      const deliver = (e: GraphEdge, f0: number) => {
        const f = breakerOpen(e) ? 0 : f0 * attempts(e, prevS(e.target))
        if (f > f0) extraIn.set(e.target, (extraIn.get(e.target) ?? 0) + (f - f0))
        edgeM[e.id].rps += f
        edgeFlow.get(e.id)![cls] += f
        if (!cut.has(e.id)) {
          inflow.get(e.target)![cls] += f
          const tgt = byId.get(e.target)!
          if (tgt.data.config.region === GLOBAL) {
            const tot = [...myLocs.values()].reduce((a, b) => a + b, 0) || 1
            myLocs.forEach((v, loc) => addOrigin(e.target, loc, (f * v) / tot))
          }
        }
      }
      all.forEach((e) => deliver(e, amount))
      const healthy = split.filter(edgeUsable)
      const W = healthy.reduce((s, e) => s + Math.max(0, ed(e).weight), 0)
      const regionalTargets = healthy.filter((e) => byId.get(e.target)!.data.config.region !== GLOBAL)
      if (cfg.region === GLOBAL && regionalTargets.length > 1 && myLocs.size > 0) {
        // geo-routing: each user location goes to its nearest healthy region
        const tot = [...myLocs.values()].reduce((a, b) => a + b, 0) || 1
        myLocs.forEach((v, loc) => {
          let best = regionalTargets[0]
          let bestD = Infinity
          for (const e of regionalTargets) {
            const d = rttMs(loc, byId.get(e.target)!.data.config.region)
            if (d < bestD) {
              bestD = d
              best = e
            }
          }
          const f0 = (amount * v) / tot
          const f = breakerOpen(best) ? 0 : f0 * attempts(best, prevS(best.target))
          if (f > f0) extraIn.set(best.target, (extraIn.get(best.target) ?? 0) + (f - f0))
          edgeM[best.id].rps += f
          edgeFlow.get(best.id)![cls] += f
          if (!cut.has(best.id)) inflow.get(best.target)![cls] += f
        })
      } else if (healthy.length && W > 0) healthy.forEach((e) => deliver(e, (amount * Math.max(0, ed(e).weight)) / W))
      else if (split.length) {
        // nowhere healthy to go: attempts shown on edges, never delivered
        split.forEach((e) => (edgeM[e.id].rps += amount / split.length))
      }
    }
    metrics[id] = m
  }

  // ---------- edge latency ----------
  const locOf = (n: GraphNode) => n.data.config.region
  const edgeLat = (e: GraphEdge): number => {
    const s = byId.get(e.source)!
    const t = byId.get(e.target)!
    const extra = chaos.edgeDelay[e.id] ?? 0
    const sG = locOf(s) === GLOBAL
    const tG = locOf(t) === GLOBAL
    let l: number
    if (sG && tG) l = 2
    else if (tG) l = s.data.kind === 'client' ? 8 : 4
    else if (sG) {
      const o = origins.get(s.id)
      if (!o || o.size === 0) l = 40
      else {
        let sum = 0
        let w = 0
        o.forEach((v, loc) => {
          sum += v * rttMs(loc, locOf(t))
          w += v
        })
        l = w > 0 ? sum / w : 40
      }
    } else {
      l = rttMs(locOf(s), locOf(t))
      if (s.data.kind === 'client') l += 5
    }
    return l + extra
  }

  // ---------- backward pass: success & latency ----------
  // Regional nodes have one answer; global nodes (DNS/CDN) depend on where the user is,
  // so they are evaluated per user location.
  type Ev = { s: Flow; l: Flow; ms: Flow; t: Flow } // ms = slow-path mean, t = tail² (variance proxy)
  const memo = new Map<string, Ev>()
  const isGlobal = (n: GraphNode) => n.data.config.region === GLOBAL
  const hopLat = (src: GraphNode, here: string, e: GraphEdge): number => {
    const t = byId.get(e.target)!
    const extra = chaos.edgeDelay[e.id] ?? 0
    const tG = isGlobal(t)
    let l: number
    if (src.data.kind === 'client') l = tG ? 8 : rttMs(here, t.data.config.region) + 5
    else if (isGlobal(src)) l = tG ? 2 : rttMs(here, t.data.config.region)
    else l = tG ? 4 : rttMs(here, t.data.config.region)
    return l + extra
  }
  const evalNode = (id: string, loc: string): Ev => {
    const n = byId.get(id)!
    const g = isGlobal(n)
    const key = g ? `${id}@${loc}` : id
    const cached = memo.get(key)
    if (cached) return cached
    const here = g ? loc : n.data.config.region
    const def = CATALOG[n.data.kind]
    const os = ownS.get(id)!
    const ol = ownLat.get(id)!
    const outs = (outE.get(id) ?? []).filter((e) => !isBack(e))
    const ev: Ev = { s: { r: 1, w: 1 }, l: { r: 0, w: 0 }, ms: { r: 0, w: 0 }, t: { r: 0, w: 0 } }
    for (const cls of ['r', 'w'] as const) {
      const pass = cls === 'r' ? passR.get(id)! : def.terminal ? 0 : 1
      const elig = outs.filter((e) => ed(e).filter === 'any' || ed(e).filter === (cls === 'r' ? 'read' : 'write'))
      let dS = 1
      let dL = 0
      let dMs = 0
      let dT = 0
      if (n.data.kind === 'client' && elig.length === 0) dS = 0 // users with nowhere to send requests
      if (!def.async && pass > 0 && elig.length) {
        const child = (e: GraphEdge) => {
          const t = byId.get(e.target)!
          return evalNode(e.target, isGlobal(t) ? here : t.data.config.region)
        }
        for (const e of elig.filter((x) => ed(x).mode === 'all')) {
          const ok = !cut.has(e.id)
          const lat = hopLat(n, here, e)
          const c = ok && !breakerOpen(e) ? child(e) : null
          const a = c ? attempts(e, c.s[cls]) : 1
          dS *= c ? retriedSuccess(e, c.s[cls]) : 0
          dL += (lat + (c ? c.l[cls] : 0)) * a
          dMs += (lat + (c ? c.ms[cls] : 0)) * a
          dT += c ? c.t[cls] * a : 0
        }
        const split = elig.filter((x) => ed(x).mode !== 'all')
        if (split.length) {
          let healthy = split.filter(edgeUsable)
          let weights: number[]
          const regional = healthy.filter((e) => !isGlobal(byId.get(e.target)!))
          if (g && regional.length > 1) {
            // geo-routing: nearest healthy region for this user location
            let best = regional[0]
            let bestD = Infinity
            for (const e of regional) {
              const d = rttMs(here, byId.get(e.target)!.data.config.region)
              if (d < bestD) {
                bestD = d
                best = e
              }
            }
            healthy = [best]
            weights = [1]
          } else {
            const fw = healthy.map((e) => edgeFlow.get(e.id)![cls])
            const fsum = fw.reduce((a, b) => a + b, 0)
            weights = fsum > 1e-9 ? fw : healthy.map((e) => Math.max(0, ed(e).weight))
          }
          const W = weights.reduce((a, b) => a + b, 0)
          if (!healthy.length || W <= 0) dS = 0
          else {
            let ss = 0
            let ll = 0
            let worst = -1
            let wMs = 0
            let wT = 0
            healthy.forEach((e, i) => {
              const w = weights[i] / W
              if (w <= 0) return
              const lat = hopLat(n, here, e)
              const c = child(e)
              const a = attempts(e, c.s[cls])
              ss += w * retriedSuccess(e, c.s[cls])
              ll += w * (lat + c.l[cls]) * a
              // the p99 request lands in the slowest branch that carries >= 1 % of traffic
              const p = (lat + c.ms[cls]) * a + Math.sqrt(c.t[cls])
              if (w >= 0.01 && p > worst) {
                worst = p
                wMs = (lat + c.ms[cls]) * a
                wT = c.t[cls]
              }
            })
            dS *= ss
            dL += ll
            dMs += wMs
            dT += wT
          }
        }
      }
      const own = cls === 'r' ? os.r : os.w
      ev.s[cls] = own * (1 - pass + pass * dS)
      ev.l[cls] = Math.min(MAX_LAT, (cls === 'r' ? ol.r : ol.w) + pass * dL)
      const oMean = cls === 'r' ? ol.r : ol.w
      const oTail = Math.max(0, (cls === 'r' ? ol.pr : ol.pw) - oMean)
      const slow = pass >= 0.01
      ev.ms[cls] = Math.min(MAX_LAT, oMean + (slow ? dMs : 0))
      ev.t[cls] = oTail * oTail + (slow ? dT : 0)
    }
    memo.set(key, ev)
    return ev
  }

  // per-node end-to-end success
  for (const n of nodes) {
    if (n.data.kind === 'client') continue
    const m = metrics[n.id]
    const tot = m.inRead + m.inWrite
    const mix = (ev: Ev) => (tot > 0 ? (m.inRead * ev.s.r + m.inWrite * ev.s.w) / tot : (ev.s.r + ev.s.w) / 2)
    if (isGlobal(n)) {
      const o = origins.get(n.id)
      if (o && o.size) {
        let sum = 0
        let w = 0
        o.forEach((v, loc) => {
          sum += v * mix(evalNode(n.id, loc))
          w += v
        })
        m.success = w > 0 ? sum / w : 1
      } else m.success = mix(evalNode(n.id, 'us-east-1'))
    } else m.success = mix(evalNode(n.id, n.data.config.region))
  }

  // edge metrics
  validEdges.forEach((e) => {
    const em = edgeM[e.id]
    em.latencyMs = edgeLat(e)
    if (!em.healthy) em.errRate = 1
    else em.errRate = 1 - (metrics[e.target]?.success ?? 1)
  })

  // remember success for next tick's retry behaviour; report retry amplification
  for (const n of nodes) {
    const m = metrics[n.id]
    if (n.data.kind !== 'client') runtime.prevSuccess[n.id] = m.success
    const extra = extraIn.get(n.id) ?? 0
    const tot = m.inRead + m.inWrite
    if (extra > 0.5 && tot > extra) m.retryAmp = tot / (tot - extra)
  }

  // ---------- totals ----------
  let offered = 0
  let success = 0
  let latW = 0
  let worstP99 = 0
  for (const n of nodes) {
    if (n.data.kind !== 'client') continue
    const m = metrics[n.id]
    const cfg = n.data.config
    const tot = m.offered ?? 0
    const r = tot * cfg.readRatio
    const w = tot - r
    const ev = evalNode(n.id, cfg.region)
    const ok = r * ev.s.r + w * ev.s.w
    m.success = tot > 0 ? ok / tot : 1
    m.e2eLatency = tot > 0 ? (r * ev.l.r + w * ev.l.w) / tot : ev.l.r
    const p99r = Math.min(MAX_LAT * 2, ev.ms.r + Math.sqrt(ev.t.r))
    const p99w = Math.min(MAX_LAT * 2, ev.ms.w + Math.sqrt(ev.t.w))
    // p99 over the mix: the slow class dominates once it is >= 1 % of traffic
    const rr = cfg.readRatio
    m.e2eP99 = rr >= 0.99 ? p99r : rr <= 0.01 ? p99w : Math.max(p99r, p99w)
    m.latency = m.e2eLatency
    m.p99 = m.e2eP99
    offered += tot
    success += ok
    latW += tot * m.e2eLatency
    if (tot > 0) worstP99 = Math.max(worstP99, m.e2eP99)
  }

  // ---------- cost ----------
  const avgPayload = payloadW > 0 ? payloadSum / payloadW : 20
  const gbPerMonth = (rps: number) => (rps * avgPayload * SECONDS_PER_MONTH) / 1_048_576
  /** bytes flow back with responses: reads carry the payload, writes return a ~1 KB ack (ingress is free) */
  const gbFor = (r: number, w: number) => ((r * avgPayload + w * 1) * SECONDS_PER_MONTH) / 1_048_576
  const mReq = (rps: number) => (rps * SECONDS_PER_MONTH) / 1e6
  let egressTotal = 0
  for (const n of nodes) {
    const m = metrics[n.id]
    const cfg = n.data.config
    const hours = 730
    const served = m.inRead + m.inWrite
    const k = n.data.kind
    const baseline = CATALOG[k].autoscalable && cfg.autoscale ? cfg.minInstances : cfg.instances
    let c = 0
    switch (k) {
      case 'client': c = 0; break
      case 'dns': c = 0.5 + mReq(served) * 0.01 * 0.4; break // resolvers cache: ~1 % of requests become lookups
      case 'cdn': c = tiered(gbFor(m.inRead, m.inWrite), CDN_TIERS) + mReq(served) * 0.75; break
      case 'edgefn': c = mReq(served) * 0.3; break
      case 'waf': c = 5 + mReq(served) * 0.6; break
      case 'ratelimiter': c = 15 + mReq(served) * 0.1; break
      case 'lb': c = 22 + gbFor(m.inRead, m.inWrite) * 0.008 + gbPerMonth(m.inWrite) * 0.008; break
      case 'gateway': c = mReq(served) * 1.0; break
      case 'auth': c = 10 + mReq(served) * 0.25; break
      case 'app':
      case 'worker':
      case 'websocket':
      case 'container':
      case 'streamproc':
      case 'inference':
      case 'search':
      case 'cache':
        c = instanceCost(k, cfg, m.instances, baseline); break
      case 'k8s': c = instanceCost(k, cfg, m.instances, baseline) + 73; break
      case 'warehouse': c = instanceCost(k, cfg, m.instances, baseline) + cfg.storageGB * 0.024; break
      case 'serverless': c = mReq(served) * (0.2 + 0.0000166667 * 0.5 * (cfg.latencyMs / 1000) * 1e6); break
      case 'sql': {
        const units = (1 + cfg.replicas + (cfg.multiAz ? 1 : 0)) * Math.max(1, cfg.shards)
        c = instanceCost(k, cfg, units, units) + cfg.storageGB * 0.115 * (cfg.multiAz ? 2 : 1)
        break
      }
      case 'nosql': c = mReq(m.inRead) * 0.25 * (cfg.consistency === 'strong' ? 2 : 1) + mReq(m.inWrite) * 1.25 + cfg.storageGB * 0.25; break
      case 'globaldb': {
        const regions = Math.max(2, cfg.replicas)
        c = Math.max(1, cfg.shards) * regions * 0.65 * hours * (cfg.consistency === 'strong' ? 1.2 : 1) + cfg.storageGB * 0.3 * regions
        break
      }
      case 'storage': c = cfg.storageGB * 0.023 + mReq(m.inRead) * 0.4 + mReq(m.inWrite) * 5; break
      case 'queue': c = mReq(served) * 0.4; break
      case 'pubsub': c = mReq(served) * 0.5 * Math.max(1, (outE.get(n.id) ?? []).length); break
      case 'stream': c = Math.max(1, cfg.shards) * 0.015 * hours + mReq(served) * 0.014; break
      case 'notify':
      case 'external': c = mReq(m.servedRps) * cfg.unitCost * 1000; break
    }
    m.cost = c
  }
  // Egress: bytes leaving to users are billed where they exit (first regional node not behind a CDN);
  // CDN → origin and same-region traffic are not billed here; cross-region hops are $0.02/GB.
  const internetGB = new Map<string, number>()
  let internetTotalGB = 0
  for (const e of validEdges) {
    const em = edgeM[e.id]
    if (em.rps <= 0 || cut.has(e.id)) continue
    const s = byId.get(e.source)!
    const t = byId.get(e.target)!
    const sG = locOf(s) === GLOBAL || s.data.kind === 'client'
    const tG = locOf(t) === GLOBAL
    const fl = edgeFlow.get(e.id)!
    if (sG && !tG && s.data.kind !== 'cdn' && s.data.kind !== 'edgefn') {
      const gb = gbFor(fl.r, fl.w)
      internetGB.set(t.id, (internetGB.get(t.id) ?? 0) + gb)
      internetTotalGB += gb
    } else if (!sG && !tG && locOf(s) !== locOf(t)) {
      const eg = (gbFor(fl.r, fl.w) + gbPerMonth(fl.w)) * 0.02
      metrics[s.id].egressCost += eg
      egressTotal += eg
    }
  }
  if (internetTotalGB > 0) {
    const total = tiered(internetTotalGB, INTERNET_TIERS)
    internetGB.forEach((gb, id) => {
      const share = (total * gb) / internetTotalGB
      metrics[id].egressCost += share
      egressTotal += share
    })
  }
  let monthly = egressTotal
  for (const id in metrics) monthly += metrics[id].cost

  // bottleneck
  let bottleneckId: string | null = null
  let bottleneckUtil = 0
  for (const n of nodes) {
    if (n.data.kind === 'client' || n.data.kind === 'ratelimiter') continue
    const m = metrics[n.id]
    if (m.healthy && m.util > bottleneckUtil) {
      bottleneckUtil = m.util
      bottleneckId = n.id
    }
  }

  const avgLatency = offered > 0 ? latW / offered : 0
  const result: SimResult = {
    time,
    nodes: metrics,
    edges: edgeM,
    warnings,
    totals: {
      offered,
      success,
      errors: offered - success,
      availability: offered > 0 ? success / offered : 1,
      avgLatency,
      p99: worstP99,
      monthlyCost: monthly,
      egressCost: egressTotal,
      costPerMillion: success > 0 ? monthly / mReq(success) : 0,
      bottleneckId,
      bottleneckUtil,
      maxBacklogSec: Math.max(0, ...nodes.map((n) => metrics[n.id].backlogAgeSec ?? 0).filter(Number.isFinite)),
    },
  }
  return { result, runtime }
}

// ---------- full-day stress test ----------
export interface DayReport {
  hours: { hour: number; offered: number; availability: number; p99: number; cost: number }[]
  minAvailability: number
  worstP99: number
  avgMonthlyCost: number
  peakRps: number
  worstHour: number
  dayAvailability: number
  /** request-weighted 99th percentile across the day's minutes */
  dayP99: number
  maxBacklogSec: number
}

export function runDay(nodes: GraphNode[], edges: GraphEdge[], chaos: Chaos, stepSec = 60): DayReport {
  let runtime: Runtime = { instances: {}, cooldown: {}, backlog: {}, prevSuccess: {} }
  const hours: DayReport['hours'] = []
  let minAvail = 1
  let worstP99 = 0
  let worstHour = 0
  let costSum = 0
  let costN = 0
  let peak = 0
  let offSum = 0
  let okSum = 0
  const samples: { p99: number; w: number }[] = []
  let maxBacklog = 0
  const quietChaos: Chaos = { ...chaos, failedAZs: chaos.failedAZs ?? [], flushedCaches: {} }
  // warm-up one hour before midnight so autoscalers settle
  for (let t = -3600; t < 0; t += stepSec) runtime = step({ nodes, edges, chaos: quietChaos, runtime, time: t, dt: stepSec }).runtime
  let bucket = { offered: 0, availMin: 1, p99: 0, cost: 0, n: 0 }
  for (let t = 0; t < DAY; t += stepSec) {
    const out = step({ nodes, edges, chaos: quietChaos, runtime, time: t, dt: stepSec })
    runtime = out.runtime
    const tt = out.result.totals
    bucket.offered = Math.max(bucket.offered, tt.offered)
    bucket.availMin = Math.min(bucket.availMin, tt.availability)
    bucket.p99 = Math.max(bucket.p99, tt.p99)
    bucket.cost += tt.monthlyCost
    bucket.n++
    costSum += tt.monthlyCost
    costN++
    peak = Math.max(peak, tt.offered)
    offSum += tt.offered
    okSum += tt.success
    samples.push({ p99: tt.p99, w: tt.offered })
    maxBacklog = Math.max(maxBacklog, Number.isFinite(tt.maxBacklogSec) ? tt.maxBacklogSec : 1e9)
    if (tt.availability < minAvail) {
      minAvail = tt.availability
      worstHour = Math.floor(t / 3600)
    }
    worstP99 = Math.max(worstP99, tt.p99)
    if ((t + stepSec) % 3600 === 0) {
      hours.push({ hour: t / 3600 | 0, offered: bucket.offered, availability: bucket.availMin, p99: bucket.p99, cost: bucket.cost / bucket.n })
      bucket = { offered: 0, availMin: 1, p99: 0, cost: 0, n: 0 }
    }
  }
  samples.sort((a, b) => a.p99 - b.p99)
  let acc = 0
  let dayP99 = 0
  for (const smp of samples) {
    acc += smp.w
    dayP99 = smp.p99
    if (acc >= 0.99 * offSum) break
  }
  return { dayP99, maxBacklogSec: maxBacklog, hours, minAvailability: minAvail, worstP99, avgMonthlyCost: costSum / Math.max(1, costN), peakRps: peak, worstHour, dayAvailability: offSum > 0 ? okSum / offSum : 1 }
}

export const locationName = (id: string) => (id === GLOBAL ? 'Global edge' : getLocation(id)?.name ?? id)
