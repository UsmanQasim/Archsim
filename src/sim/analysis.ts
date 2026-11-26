/**
 * Analysis tools built on the simulation engine:
 *  - steadyState: the system at peak hour after autoscalers settle
 *  - findLimit:   ramp traffic until something breaks
 *  - traceTree:   where a user's request spends its time, hop by hop
 */
import { CATALOG } from './catalog'
import { DEFAULT_EDGE, step } from './engine'
import { GLOBAL, rttMs } from './regions'
import type { Chaos, GraphEdge, GraphNode, NodeKind, Runtime, SimResult } from './types'

const emptyRt = (): Runtime => ({ instances: {}, cooldown: {}, backlog: {}, prevSuccess: {} })

/** Run ~40 simulated minutes leading up to `hour` so autoscaling and queues settle, at `mult`× traffic. */
export function steadyState(nodes: GraphNode[], edges: GraphEdge[], chaos: Chaos, mult = 1, hour = 16): SimResult {
  const c: Chaos = { ...chaos, failedAZs: chaos.failedAZs ?? [], trafficMult: (chaos.trafficMult || 1) * mult, flushedCaches: {} }
  let runtime = emptyRt()
  let result: SimResult | null = null
  const start = hour * 3600 - 40 * 60
  for (let i = 0; i <= 40; i++) {
    const out = step({ nodes, edges, chaos: c, runtime, time: start + i * 60, dt: 60 })
    runtime = out.runtime
    result = out.result
  }
  return result!
}

export interface LimitPoint {
  mult: number
  offered: number
  availability: number
  p99: number
  cost: number
  bottleneckId: string | null
  bottleneckUtil: number
}

export interface LimitReport {
  points: LimitPoint[]
  /** first multiplier that broke the targets, or null if it survived ×20 */
  breakAt: number | null
  /** the component that gave out first */
  breakerId: string | null
  /** highest traffic (req/s) that still met the bar */
  safeRps: number
  baseRps: number
}

const MULTS = [1, 1.5, 2, 3, 4, 5, 6, 8, 10, 13, 16, 20]

export function findLimit(nodes: GraphNode[], edges: GraphEdge[], chaos: Chaos): LimitReport {
  const points: LimitPoint[] = []
  let breakAt: number | null = null
  let breakerId: string | null = null
  let safeRps = 0
  let baseP99 = 0
  for (const mult of MULTS) {
    const r = steadyState(nodes, edges, chaos, mult)
    const t = r.totals
    const p: LimitPoint = { mult, offered: t.offered, availability: t.availability, p99: t.p99, cost: t.monthlyCost, bottleneckId: t.bottleneckId, bottleneckUtil: t.bottleneckUtil }
    points.push(p)
    if (mult === 1) baseP99 = t.p99
    const broken = t.availability < 0.999 || t.p99 > Math.max(baseP99 * 2, baseP99 + 250)
    if (broken) {
      breakAt = mult
      // whatever is most overloaded (or dead) is what gave out
      let worst: string | null = null
      let worstU = -1
      for (const n of nodes) {
        if (n.data.kind === 'client') continue
        const m = r.nodes[n.id]
        const u = !m.healthy ? 99 : m.util
        if (u > worstU) {
          worstU = u
          worst = n.id
        }
      }
      breakerId = worst
      break
    }
    safeRps = t.offered
  }
  return { points, breakAt, breakerId, safeRps, baseRps: points[0]?.offered ?? 0 }
}

// ------------------------------------------------------------------ latency trace
export interface TraceRow {
  id: string
  label: string
  kind: NodeKind
  depth: number
  /** probability a request reaches this component */
  reach: number
  /** network time to get here (ms) */
  hopMs: number
  /** time spent inside (queueing + service, ms) */
  ownMs: number
  /** reach × (hop + own): what this row adds to the average request */
  contribution: number
  note?: string
}

export function traceTree(nodes: GraphNode[], edges: GraphEdge[], res: SimResult, clientId: string, chaos?: Chaos): { rows: TraceRow[]; total: number } {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const rows: TraceRow[] = []
  const ed = (e: GraphEdge) => e.data ?? DEFAULT_EDGE
  const isG = (n: GraphNode) => n.data.config.region === GLOBAL
  // same network model as the engine, evaluated for this user's location
  const hop = (src: GraphNode, here: string, e: GraphEdge) => {
    const t = byId.get(e.target)!
    const extra = chaos?.edgeDelay[e.id] ?? 0
    const tG = isG(t)
    let l: number
    if (src.data.kind === 'client') l = tG ? 8 : rttMs(here, t.data.config.region) + 5
    else if (isG(src)) l = tG ? 2 : rttMs(here, t.data.config.region)
    else l = tG ? 4 : rttMs(here, t.data.config.region)
    return l + extra
  }
  const dead = (e: GraphEdge) => (chaos?.cutEdges.includes(e.id) ?? false) || !(res.nodes[e.target]?.healthy ?? true)
  const visit = (id: string, here: string, reach: number, hopMs: number, depth: number, path: Set<string>) => {
    const n = byId.get(id)
    if (!n || reach < 0.002 || depth > 14) return
    const m = res.nodes[id]
    const def = CATALOG[n.data.kind]
    const isClient = n.data.kind === 'client'
    const ownMs = isClient ? 0 : m?.latency ?? 0
    const row: TraceRow = { id, label: n.data.label, kind: n.data.kind, depth, reach, hopMs, ownMs, contribution: reach * (hopMs + ownMs) }
    if (!isClient && m && !m.healthy) row.note = 'down: requests fail here'
    rows.push(row)
    if (!isClient && (!m || !m.healthy)) return
    if (def.async) {
      if (edges.some((e) => e.source === id)) row.note = 'work continues in the background; the user does not wait'
      return
    }
    let pass = 1
    if (n.data.kind === 'cache' || n.data.kind === 'cdn' || n.data.kind === 'edgefn') {
      pass = 1 - (m?.effectiveHit ?? n.data.config.hitRate)
      row.note = `answers ${Math.round((1 - pass) * 100)} % itself`
    }
    if (def.terminal || pass <= 0) return
    const loc = isG(n) ? here : n.data.config.region
    const outs = edges.filter((e) => e.source === id && !path.has(e.target) && !res.edges[e.id]?.back)
    const all = outs.filter((e) => ed(e).mode === 'all')
    let split = outs.filter((e) => ed(e).mode !== 'all' && !dead(e))
    const next = new Set(path).add(id)
    const childLoc = (e: GraphEdge) => (isG(byId.get(e.target)!) ? loc : byId.get(e.target)!.data.config.region)
    for (const e of all) visit(e.target, childLoc(e), reach * pass, hop(n, loc, e), depth + 1, next)
    // global entry points send each city to its nearest healthy region
    const regional = split.filter((e) => !isG(byId.get(e.target)!))
    if (isG(n) && regional.length > 1) {
      split = [regional.reduce((best, e) => (rttMs(loc, byId.get(e.target)!.data.config.region) < rttMs(loc, byId.get(best.target)!.data.config.region) ? e : best))]
    }
    const flows = split.map((e) => res.edges[e.id]?.rps ?? 0)
    const total = flows.reduce((a, b) => a + b, 0)
    split.forEach((e, i) => {
      const share = split.length === 1 ? 1 : total > 0 ? flows[i] / total : 1 / split.length
      visit(e.target, childLoc(e), reach * pass * share, hop(n, loc, e), depth + 1, next)
    })
  }
  const c = byId.get(clientId)
  if (c) visit(clientId, c.data.config.region, 1, 0, 0, new Set())
  return { rows, total: rows.reduce((s, r) => s + r.contribution, 0) }
}

// ---------------------------------------------------------------- growth plan
export interface GrowthMonth {
  month: number
  mult: number
  offered: number
  availability: number
  p99: number
  cost: number
  broken: boolean
  overBudget: boolean
  worstId: string | null
}

export interface GrowthReport {
  growth: number
  budget: number | null
  months: GrowthMonth[]
  /** first month the design misses its targets */
  breaksAt: number | null
  breakerId: string | null
  /** first month the bill goes over budget */
  overAt: number | null
}

export function growthPlan(
  nodes: GraphNode[],
  edges: GraphEdge[],
  chaos: Chaos,
  growth: number,
  budget: number | null,
  targets?: { p99: number; availability: number },
): GrowthReport {
  const months: GrowthMonth[] = []
  let breaksAt: number | null = null
  let breakerId: string | null = null
  let overAt: number | null = null
  let baseP99 = 0
  for (let m = 0; m <= 12; m++) {
    const mult = Math.pow(1 + growth, m)
    const r = steadyState(nodes, edges, chaos, mult)
    const t = r.totals
    if (m === 0) baseP99 = t.p99
    const p99Limit = targets?.p99 ?? Math.max(baseP99 * 2, baseP99 + 250)
    const availLimit = targets?.availability ?? 0.999
    const broken = t.offered > 0 && (t.availability < availLimit || t.p99 > p99Limit)
    let worst: string | null = null
    let worstU = -1
    for (const n of nodes) {
      if (n.data.kind === 'client') continue
      const nm = r.nodes[n.id]
      if (!nm) continue
      const u = !nm.healthy ? 99 : nm.util
      if (u > worstU) {
        worstU = u
        worst = n.id
      }
    }
    const overBudget = budget !== null && t.monthlyCost > budget
    months.push({ month: m, mult, offered: t.offered, availability: t.availability, p99: t.p99, cost: t.monthlyCost, broken, overBudget, worstId: worst })
    if (broken && breaksAt === null) {
      breaksAt = m
      breakerId = worst
    }
    if (overBudget && overAt === null) overAt = m
  }
  return { growth, budget, months, breaksAt, breakerId, overAt }
}
