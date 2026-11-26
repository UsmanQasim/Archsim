import { CATALOG } from './catalog'
import { instanceCost, nodeCapacity } from './engine'
import { GLOBAL, regionShort, rttMs } from './regions'
import type { GraphEdge, GraphNode, NodeConfig, NodeKind, SimEdgeData, SimResult } from './types'

export type Severity = 'critical' | 'warn' | 'tip'

export type Fix =
  | { type: 'patch'; nodeId: string; patch: Partial<NodeConfig> }
  | { type: 'insertBefore'; kind: NodeKind; nodeId: string; patch?: Partial<NodeConfig> }
  | { type: 'insertAfter'; kind: NodeKind; nodeId: string; patch?: Partial<NodeConfig> }
  | { type: 'edge'; edgeId: string; patch: Partial<SimEdgeData> }

export interface Advice {
  id: string
  severity: Severity
  title: string
  detail: string
  nodeId?: string
  fix?: Fix
  fixLabel?: string
  /** cost optimisation advice, with estimated monthly saving */
  cost?: boolean
  saving?: number
}

const pct = (x: number) => `${Math.round(x * 100)}%`
const money = (x: number) => `$${Math.round(x).toLocaleString()}`

export function advise(nodes: GraphNode[], edges: GraphEdge[], res: SimResult | null): Advice[] {
  if (!res) return []
  const out: Advice[] = []
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const parents = (id: string) => edges.filter((e) => e.target === id).map((e) => byId.get(e.source)!).filter(Boolean)
  const children = (id: string) => edges.filter((e) => e.source === id).map((e) => byId.get(e.target)!).filter(Boolean)
  const has = (k: NodeKind) => nodes.some((n) => n.data.kind === k)
  const clients = nodes.filter((n) => n.data.kind === 'client')
  const anyTraffic = res.totals.offered > 0

  res.warnings.forEach((w, i) => out.push({ id: `warn-${i}`, severity: 'warn', title: 'Graph problem', detail: w }))

  if (!clients.length) {
    out.push({ id: 'no-clients', severity: 'tip', title: 'Add users to generate traffic', detail: 'Drag a "Users" node onto the canvas and connect it to your entry point.' })
  }

  if (anyTraffic && res.totals.availability < 0.99) {
    const failing = nodes.filter((n) => !res.nodes[n.id]?.healthy).map((n) => n.data.label)
    out.push({
      id: 'availability', severity: 'critical',
      title: `${pct(1 - res.totals.availability)} of requests are failing`,
      detail: failing.length
        ? `Down: ${failing.join(', ')}. Anything that has no healthy sibling behind a split edge takes its traffic down with it.`
        : 'Some components are overloaded and dropping requests — see the red nodes.',
    })
  }

  for (const n of nodes) {
    const m = res.nodes[n.id]
    if (!m) continue
    const { kind, config: cfg, label } = n.data
    const def = CATALOG[kind]
    if (kind === 'client') continue
    const load = m.inRead + m.inWrite

    // --- single points of failure (self-managed only; managed services are multi-AZ) ---
    if (m.healthy && load > 0) {
      if (def.scalable && kind !== 'sql' && kind !== 'warehouse' && m.instances < 2) {
        out.push({
          id: `spof-${n.id}`, severity: 'warn', nodeId: n.id,
          title: `${label} is a single point of failure`,
          detail: 'One instance: a crash or deploy takes it offline. Run at least 2 across availability zones.',
          fix: { type: 'patch', nodeId: n.id, patch: { instances: 2, minInstances: Math.max(2, cfg.minInstances) } },
          fixLabel: 'Run 2 instances',
        })
      }
      if (kind === 'sql' && cfg.replicas === 0 && !cfg.multiAz) {
        out.push({
          id: `spof-${n.id}`, severity: 'warn', nodeId: n.id,
          title: `${label} lives in one availability zone`,
          detail: 'If that zone (or the primary) dies, writes and reads stop. Multi-AZ keeps a synchronous standby that takes over in ~60 s with no data loss.',
          fix: { type: 'patch', nodeId: n.id, patch: { multiAz: true } },
          fixLabel: 'Enable Multi-AZ',
        })
      }
      if (def.pricingLevers && cfg.pricing === 'spot' && (kind === 'sql' || kind === 'cache' || kind === 'search' || kind === 'warehouse')) {
        out.push({
          id: `spotstate-${n.id}`, severity: 'warn', nodeId: n.id,
          title: `${label} runs on spot capacity`,
          detail: 'Stateful systems lose data and warm caches when spot instances are reclaimed. Use reserved capacity instead.',
          fix: { type: 'patch', nodeId: n.id, patch: { pricing: 'reserved' } },
          fixLabel: 'Switch to reserved',
        })
      }
      if (m.azDegraded) {
        out.push({ id: `az-${n.id}`, severity: 'warn', nodeId: n.id, title: `${label} lost a zone and is running at reduced capacity`, detail: 'Size fleets so the survivors can carry peak load (N+1 across zones).' })
      }
    }

    // --- hot / overloaded ---
    if (m.healthy && m.util > 0.85 && kind !== 'ratelimiter') {
      const sev: Severity = m.util > 1 ? 'critical' : 'warn'
      const title = m.util > 1
        ? `${label} is overloaded (${pct(m.util)}) — dropping ${Math.round(m.droppedRps).toLocaleString()} req/s`
        : `${label} is running hot (${pct(m.util)})`
      let fix: Fix | undefined
      let fixLabel: string | undefined
      let detail = 'Latency rises steeply above ~80 % utilisation (queueing).'
      if (def.autoscalable) {
        const want = Math.ceil(m.instances * Math.min(m.util, 6) / 0.6)
        if (!cfg.autoscale) {
          fix = { type: 'patch', nodeId: n.id, patch: { autoscale: true, instances: want, minInstances: Math.max(2, Math.min(cfg.minInstances, want)), maxInstances: Math.max(cfg.maxInstances, want * 3, 20) } }
          fixLabel = `Autoscale (start at ${want})`
        } else {
          fix = { type: 'patch', nodeId: n.id, patch: { maxInstances: Math.max(cfg.maxInstances * 2, want) } }
          fixLabel = `Raise max to ${Math.max(cfg.maxInstances * 2, want)}`
          detail = 'Autoscaling may be capped at max instances, or still catching up.'
        }
      } else if (kind === 'cache') {
        const want = Math.ceil(m.instances * m.util / 0.6)
        fix = { type: 'patch', nodeId: n.id, patch: { instances: want } }
        fixLabel = `Scale to ${want} nodes`
      } else if (kind === 'sql') {
        const cap = nodeCapacity(cfg, kind, 1)
        const uR = m.inRead / cap.read
        const uW = m.inWrite / cap.write
        const hasCache = parents(n.id).some((p) => p.data.kind === 'cache')
        if (uR >= uW && !hasCache) {
          fix = { type: 'insertBefore', kind: 'cache', nodeId: n.id, patch: { region: cfg.region } }
          fixLabel = 'Put a cache in front'
          detail = `Read-bound (${pct(uR)} of read capacity). A cache with 80 % hit rate removes most of that load.`
        } else if (uR >= uW) {
          const rep = Math.min(15, Math.ceil((1 + cfg.replicas) * uR / 0.6) - 1)
          fix = { type: 'patch', nodeId: n.id, patch: { replicas: rep } }
          fixLabel = `${rep} read replicas`
          detail = `Read-bound (${pct(uR)}). Replicas multiply read capacity.`
        } else {
          const sh = Math.ceil(cfg.shards * uW / 0.6)
          fix = { type: 'patch', nodeId: n.id, patch: { shards: sh } }
          fixLabel = `Shard ×${sh}`
          detail = `Write-bound (${pct(uW)}). Only sharding (or a bigger primary) adds write capacity; replicas do not.`
        }
      } else if (kind === 'nosql' || kind === 'stream') {
        const sh = Math.ceil(cfg.shards * m.util / 0.6)
        fix = { type: 'patch', nodeId: n.id, patch: { shards: sh } }
        fixLabel = `${sh} ${kind === 'stream' ? 'shards' : 'partitions'}`
      } else if (kind === 'serverless') {
        const c = Math.ceil(cfg.rateLimit * m.util / 0.6)
        fix = { type: 'patch', nodeId: n.id, patch: { rateLimit: c } }
        fixLabel = `Concurrency ${c}`
      } else if ((kind === 'external' || kind === 'notify') && !parents(n.id).some((p) => CATALOG[p.data.kind].async)) {
        fix = { type: 'insertBefore', kind: 'queue', nodeId: n.id, patch: { region: parents(n.id)[0]?.data.config.region ?? 'us-east-1' } }
        fixLabel = 'Buffer calls with a queue'
        detail = `The provider allows ${Math.round(cfg.rateLimit).toLocaleString()}/s. Calls above that fail. Put a queue + workers in front so excess waits instead of failing.`
      } else if (kind === 'storage' && !parents(n.id).some((p) => p.data.kind === 'cdn')) {
        fix = { type: 'insertBefore', kind: 'cdn', nodeId: n.id }
        fixLabel = 'Serve it via a CDN'
        detail = 'Object storage request rates are limited per prefix; a CDN absorbs repeated reads.'
      }
      out.push({ id: `hot-${n.id}`, severity: sev, nodeId: n.id, title, detail, fix, fixLabel })
    }

    if (kind === 'ratelimiter' && m.throttledRps > 1) {
      out.push({
        id: `throttle-${n.id}`, severity: 'warn', nodeId: n.id,
        title: `${label} is rejecting ${Math.round(m.throttledRps).toLocaleString()} req/s`,
        detail: 'Good for protecting the backend from abuse — bad if these are real users. Size the backend, then raise the limit.',
        fix: { type: 'patch', nodeId: n.id, patch: { rateLimit: Math.ceil(load * 1.2) } },
        fixLabel: 'Raise limit 20 % above load',
      })
    }

    // --- queues ---
    if (def.async && (m.backlogAgeSec ?? 0) > 60) {
      const worker = children(n.id).find((c) => CATALOG[c.data.kind].autoscalable)
      out.push({
        id: `backlog-${n.id}`, severity: 'warn', nodeId: n.id,
        title: `${label} backlog is ${Number.isFinite(m.backlogAgeSec!) ? `${Math.round(m.backlogAgeSec!)} s` : 'growing forever'} behind`,
        detail: 'Consumers are slower than producers. Users still get fast acks, but work (emails, orders) is delayed.',
        fix: worker ? { type: 'patch', nodeId: worker.id, patch: { autoscale: true, maxInstances: Math.max(worker.data.config.maxInstances, worker.data.config.instances * 4) } } : undefined,
        fixLabel: worker ? `Autoscale ${worker.data.label}` : undefined,
      })
    }
    if (def.async && children(n.id).length === 0 && load > 0) {
      out.push({ id: `noconsumer-${n.id}`, severity: 'tip', nodeId: n.id, title: `${label} has no consumers`, detail: 'Connect Workers (or Functions) to process the messages.' })
    }

    // --- over-provisioned ---
    if (def.scalable && !cfg.autoscale && anyTraffic && m.util < 0.15 && m.instances > 2 && m.cost > 50) {
      const want = Math.max(2, Math.ceil(m.instances * m.util / 0.5))
      const save = m.cost * (1 - want / m.instances)
      if (save > 20) out.push({
        id: `idle-${n.id}`, severity: 'tip', nodeId: n.id,
        title: `${label} is ${pct(m.util)} utilised — save ~${money(save)}/mo`,
        detail: 'You are paying for idle capacity. Scale down, or enable autoscaling to follow the daily curve.',
        fix: def.autoscalable
          ? { type: 'patch', nodeId: n.id, patch: { autoscale: true, minInstances: 2, instances: want, maxInstances: Math.max(cfg.maxInstances, m.instances) } }
          : { type: 'patch', nodeId: n.id, patch: { instances: want } },
        fixLabel: def.autoscalable ? 'Enable autoscaling' : `Scale to ${want}`,
      })
    }
  }

  // --- retry storms ---
  for (const e of edges) {
    const d = e.data
    const t = byId.get(e.target)
    if (!d || !t || !(d.retries && d.retries > 0) || d.breaker) continue
    const m = res.nodes[t.id]
    if (m && (m.util > 1 || !m.healthy || (m.retryAmp ?? 1) > 1.2)) {
      out.push({
        id: `retry-${e.id}`, severity: 'critical', nodeId: t.id,
        title: `Retry storm on ${t.data.label}${m.retryAmp ? ` (load ×${m.retryAmp.toFixed(1)})` : ''}`,
        detail: 'Callers retry failed requests, adding load to a target that is already failing — which makes it fail more. A circuit breaker (plus backoff with jitter) stops the amplification and fails fast.',
        fix: { type: 'edge', edgeId: e.id, patch: { breaker: true } },
        fixLabel: 'Add circuit breaker',
      })
    }
  }

  // --- analytics on the request path ---
  for (const n of nodes) {
    if (n.data.kind !== 'warehouse') continue
    if (parents(n.id).some((p) => ['app', 'container', 'k8s', 'serverless', 'gateway', 'lb', 'client'].includes(p.data.kind))) {
      out.push({ id: `dwh-${n.id}`, severity: 'warn', nodeId: n.id, title: `${n.data.label} is on a user-facing request path`, detail: 'Warehouses answer in hundreds of ms and are tuned for bulk scans. Feed them through a stream or queue; serve users from a cache or OLTP database.' })
    }
  }

  // --- cost optimisation ---
  for (const n of nodes) {
    const m = res.nodes[n.id]
    const def = CATALOG[n.data.kind]
    const cfg = n.data.config
    if (!m || !def.pricingLevers || m.cost < 120) continue
    const label = n.data.label
    const baseline = def.autoscalable && cfg.autoscale ? cfg.minInstances : cfg.instances
    const units = n.data.kind === 'sql' ? (1 + cfg.replicas + (cfg.multiAz ? 1 : 0)) * Math.max(1, cfg.shards) : m.instances
    const now = instanceCost(n.data.kind, cfg, units, n.data.kind === 'sql' ? units : baseline)
    const try_ = (patch: Partial<NodeConfig>) => now - instanceCost(n.data.kind, { ...cfg, ...patch }, units, n.data.kind === 'sql' ? units : baseline)
    const asyncTier = n.data.kind === 'worker' || n.data.kind === 'streamproc'
    if (cfg.pricing === 'ondemand' && asyncTier) {
      const save = try_({ pricing: 'spot' })
      if (save > 25) out.push({ id: `spot-${n.id}`, cost: true, saving: save, severity: 'tip', nodeId: n.id, title: `${label}: run on spot capacity`, detail: 'Background consumers tolerate interruptions — a reclaimed instance just means the job is retried from the queue.', fix: { type: 'patch', nodeId: n.id, patch: { pricing: 'spot' } }, fixLabel: `Spot (−${money(save)}/mo)` })
    } else if (cfg.pricing === 'ondemand') {
      const save = try_({ pricing: 'reserved' })
      if (save > 25) out.push({ id: `ri-${n.id}`, cost: true, saving: save, severity: 'tip', nodeId: n.id, title: `${label}: commit the always-on baseline`, detail: `A 1-year savings plan / reserved capacity on the ${n.data.kind === 'sql' ? units : baseline} always-on ${(n.data.kind === 'sql' ? units : baseline) === 1 ? 'node' : 'nodes'} saves ~40 % on them.${CATALOG[n.data.kind].autoscalable && cfg.autoscale ? ' Peaks above the minimum stay on-demand.' : ''}`, fix: { type: 'patch', nodeId: n.id, patch: { pricing: 'reserved' } }, fixLabel: `Reserve (−${money(save)}/mo)` })
    }
    if (def.armCapable && cfg.arch === 'x86') {
      const save = try_({ arch: 'arm' })
      if (save > 25) out.push({ id: `arm-${n.id}`, cost: true, saving: save, severity: 'tip', nodeId: n.id, title: `${label}: move to ARM instances`, detail: 'Graviton / Axion / Cobalt instances deliver the same throughput for ~20 % less on most runtimes (Node, Java, Go, Python, Postgres, Redis).', fix: { type: 'patch', nodeId: n.id, patch: { arch: 'arm' } }, fixLabel: `ARM (−${money(save)}/mo)` })
    }
  }
  const gw = nodes.filter((n) => n.data.kind === 'gateway' && (res.nodes[n.id]?.cost ?? 0) > 2500)
  gw.forEach((n) => out.push({ id: `gw-${n.id}`, cost: true, saving: res.nodes[n.id].cost * 0.8, severity: 'tip', nodeId: n.id, title: `${n.data.label} costs ${money(res.nodes[n.id].cost)}/mo in request fees`, detail: 'Per-request gateway pricing is great at low volume and painful at high volume. A load balancer (flat + per-GB) in front of containers costs a fraction at this rate.' }))
  nodes.filter((n) => n.data.kind === 'serverless' && (res.nodes[n.id]?.cost ?? 0) > 1500).forEach((n) => out.push({ id: `fn-${n.id}`, cost: true, saving: res.nodes[n.id].cost * 0.5, severity: 'tip', nodeId: n.id, title: `${n.data.label}: sustained load is cheaper on containers`, detail: 'Functions win for spiky, low-volume work. At steady high RPS, always-on containers or VMs cost far less per request.' }))
  nodes.filter((n) => n.data.kind === 'nosql' && (res.nodes[n.id]?.cost ?? 0) > 3000).forEach((n) => out.push({ id: `ddb-${n.id}`, cost: true, saving: res.nodes[n.id].cost * 0.5, severity: 'tip', nodeId: n.id, title: `${n.data.label}: on-demand billing at steady volume`, detail: 'On-demand NoSQL costs ~5–7× provisioned capacity for flat traffic. Switch to provisioned + autoscaling, cache hot reads, or batch writes.' }))
  if (res.totals.egressCost > 0.4 * res.totals.monthlyCost && res.totals.egressCost > 500) {
    out.push({ id: 'egress-heavy', cost: true, saving: res.totals.egressCost * 0.35, severity: 'tip', title: `Data transfer is ${pct(res.totals.egressCost / res.totals.monthlyCost)} of the bill`, detail: 'Serve bytes through a CDN (cheaper tiers at volume, fewer origin hits), compress responses, and keep chatty services in the same region.' })
  }

  // --- cross-region data access ---
  for (const e of edges) {
    const s = byId.get(e.source)
    const t = byId.get(e.target)
    if (!s || !t || s.data.kind === 'client') continue
    const sr = s.data.config.region
    const tr = t.data.config.region
    if (sr === GLOBAL || tr === GLOBAL || sr === tr) continue
    if (!['sql', 'nosql', 'cache', 'search'].includes(t.data.kind)) continue
    if ((res.edges[e.id]?.rps ?? 0) <= 0) continue
    const lat = rttMs(sr, tr)
    const allSameRegion = parents(t.id).every((p) => p.data.config.region === sr)
    out.push({
      id: `xregion-${e.id}`, severity: lat > 40 ? 'warn' : 'tip', nodeId: t.id,
      title: `${s.data.label} (${regionShort(sr)}) → ${t.data.label} (${regionShort(tr)}) adds ~${Math.round(lat)} ms per call`,
      detail: 'Keep data next to the compute that reads it. Cross-region calls add latency and $0.02/GB egress.',
      fix: allSameRegion ? { type: 'patch', nodeId: t.id, patch: { region: sr } } : undefined,
      fixLabel: allSameRegion ? `Move ${t.data.label} to ${regionShort(sr)}` : undefined,
    })
  }

  // --- missing building blocks ---
  for (const c of clients) {
    for (const t of children(c.id)) {
      if (t.data.kind === 'app' || t.data.kind === 'k8s') {
        out.push({
          id: `nolb-${c.id}-${t.id}`, severity: 'warn', nodeId: t.id,
          title: `Users hit ${t.data.label} directly`,
          detail: 'Without a load balancer there are no health checks: a dead server keeps receiving its share of users.',
          fix: { type: 'insertBefore', kind: 'lb', nodeId: t.id, patch: { region: t.data.config.region } },
          fixLabel: 'Insert load balancer',
        })
      }
    }
    if (!children(c.id).length) {
      out.push({ id: `unconnected-${c.id}`, severity: 'critical', nodeId: c.id, title: `${c.data.label} are not connected to anything`, detail: 'Every request from these users fails. Drag from their right-hand port to your entry point (DNS, CDN, load balancer…).' })
    }
    const cfg = c.data.config
    if (!has('cdn') && cfg.readRatio >= 0.8 && cfg.payloadKB >= 50 && (res.nodes[c.id]?.offered ?? 0) > 0) {
      out.push({
        id: `cdn-${c.id}`, severity: 'tip', nodeId: c.id,
        title: `${c.data.label}: heavy reads of large payloads, no CDN`,
        detail: `${cfg.payloadKB} KB responses at ${pct(cfg.readRatio)} reads — a CDN serves most of them from the edge, cutting latency and origin egress.`,
        fix: { type: 'insertAfter', kind: 'cdn', nodeId: c.id },
        fixLabel: 'Insert CDN',
      })
    }
  }

  const infraRegions = new Set(nodes.filter((n) => n.data.kind !== 'client' && n.data.config.region !== GLOBAL).map((n) => n.data.config.region))
  if (infraRegions.size === 1 && nodes.length > 3 && anyTraffic) {
    out.push({ id: 'one-region', severity: 'tip', title: 'Everything runs in one region', detail: 'Fine to start with. Open Chaos and lose this region to see what happens, then try adding a second region.' })
  }
  if (clients.length && nodes.length > 4 && !has('waf') && !has('ratelimiter') && !has('gateway')) {
    out.push({ id: 'no-protect', severity: 'tip', title: 'No rate limiting or WAF at the edge', detail: 'One misbehaving client or bot can overload the whole system. Add a Rate Limiter or API Gateway at the entry point.' })
  }

  const rank: Record<Severity, number> = { critical: 0, warn: 1, tip: 2 }
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || (b.saving ?? 0) - (a.saving ?? 0)).slice(0, 40)
}
