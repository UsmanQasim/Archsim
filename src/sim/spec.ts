/**
 * Challenges as plain data.
 *
 * Built-in problems in challenges.ts are written in code. Everything else (the
 * extra problem set, challenges interviewers make in the editor, challenges that
 * arrive in a link) is a ChallengeSpec: JSON that compiles to the same Challenge
 * the rest of the app uses.
 */
import { CATALOG, defaultConfig } from './catalog'
import { DEFAULT_EDGE } from './engine'
import { GLOBAL } from './regions'
import type { Graph } from './scenarios'
import type { Challenge, DesignCheck } from './challenges'
import type { GraphEdge, GraphNode, NodeConfig, NodeKind, SimEdgeData } from './types'

export type Difficulty = 'Easy' | 'Medium' | 'Hard'

/** One part of the reference design, and the solution steps it is part of. */
export interface SpecNode {
  key: string
  kind: NodeKind
  label?: string
  /** grid position: columns of 235 px, rows of 150 px */
  col: number
  row: number
  config?: Partial<NodeConfig>
  /** first step it appears in; -1 = on the starting board. Users default to -1. */
  from?: number
  /** first step it is gone again (replaced by something better) */
  until?: number
  /** config changes from a given step on: { "2": { multiAz: true } } */
  at?: Record<string, Partial<NodeConfig>>
}

export interface SpecEdge {
  a: string
  b: string
  mode?: SimEdgeData['mode']
  filter?: SimEdgeData['filter']
  weight?: number
  retries?: number
  breaker?: boolean
  from?: number
  until?: number
}

export type CheckSpec = { label?: string; why?: string } & (
  | { type: 'has'; kinds: NodeKind[]; min?: number }
  | { type: 'lacks'; kinds: NodeKind[] }
  | { type: 'path'; from: NodeKind[]; to: NodeKind[]; via?: NodeKind[] }
  | { type: 'decoupled'; from: NodeKind[]; to: NodeKind[] }
  | { type: 'noDirect'; from: NodeKind[]; to: NodeKind[] }
  | { type: 'resilient'; kinds: NodeKind[] }
  | { type: 'autoscale' }
  | { type: 'regions'; min: number }
  | { type: 'config'; kinds: NodeKind[]; field: keyof NodeConfig; op: '>=' | '<=' | '=='; value: number | string | boolean }
)

export interface ChallengeSpec {
  v: 1
  id: string
  title: string
  difficulty: Difficulty
  topic: string
  tags?: string[]
  brief: string
  concepts?: string[]
  hints?: string[]
  author?: string
  targets: Challenge['targets']
  checks: CheckSpec[]
  steps: { title: string; why: string }[]
  nodes: SpecNode[]
  edges: SpecEdge[]
}

// ------------------------------------------------------------------ checks
type G = { nodes: GraphNode[]; edges: GraphEdge[] }
const kindsOf = (g: G, kinds: NodeKind[]) => g.nodes.filter((n) => kinds.includes(n.data.kind))
const kindOf = (g: G, id: string) => g.nodes.find((n) => n.id === id)?.data.kind
const names = (kinds: NodeKind[]) => kinds.map((k) => CATALOG[k]?.label ?? k).join(' or ')

export function reaches(g: G, from: NodeKind[], to: NodeKind[], via?: NodeKind[]): boolean {
  const byId = new Map(g.nodes.map((n) => [n.id, n]))
  const start = g.nodes.filter((n) => from.includes(n.data.kind)).map((n) => n.id)
  const seen = new Set(start)
  const q = [...start]
  while (q.length) {
    const id = q.shift()!
    for (const e of g.edges) {
      if (e.source !== id || seen.has(e.target)) continue
      const t = byId.get(e.target)
      if (!t) continue
      if (to.includes(t.data.kind)) return true
      if (via && !via.includes(t.data.kind)) continue
      seen.add(t.id)
      q.push(t.id)
    }
  }
  return false
}

const ASYNC: NodeKind[] = ['queue', 'stream', 'pubsub', 'worker', 'streamproc', 'serverless']

/** Default wording for a check, so editor-made checks read well without extra typing. */
export function describeCheck(c: CheckSpec): { label: string; why: string } {
  const d = (() => {
    switch (c.type) {
      case 'has': return { label: `Uses ${c.min && c.min > 1 ? `at least ${c.min} ` : ''}${names(c.kinds)}`, why: 'The design needs this kind of component.' }
      case 'lacks': return { label: `Does without ${names(c.kinds)}`, why: 'This component is not needed here, or is the wrong tool for the job.' }
      case 'path': return { label: `Requests reach ${names(c.to)} from ${names(c.from)}`, why: 'Traffic has to actually flow through this part of the design.' }
      case 'decoupled': return { label: `${names(c.from)} hands work to ${names(c.to)} through a queue or stream`, why: 'A buffer absorbs bursts and lets each side fail or scale on its own.' }
      case 'noDirect': return { label: `${names(c.from)} never calls ${names(c.to)} directly`, why: 'Something should sit in between, such as a load balancer, cache or queue.' }
      case 'resilient': return { label: `${names(c.kinds)} survives losing a zone`, why: 'Multi-AZ or a replica keeps it running when one availability zone goes down.' }
      case 'autoscale': return { label: 'The stateless tier autoscales', why: 'Traffic follows the day; fixed fleets are too small at peak or wasted at night.' }
      case 'regions': return { label: `Runs in at least ${c.min} regions`, why: 'Users far away get lower latency, and one region can fail without taking everything down.' }
      case 'config': return { label: `${names(c.kinds)}: ${String(c.field)} ${c.op} ${String(c.value)}`, why: 'The design needs this setting.' }
    }
  })()
  return { label: c.label || d.label, why: c.why || d.why }
}

export function checkTest(c: CheckSpec): (g: G) => boolean {
  switch (c.type) {
    case 'has': return (g) => kindsOf(g, c.kinds).length >= (c.min ?? 1)
    case 'lacks': return (g) => kindsOf(g, c.kinds).length === 0
    case 'path': return (g) => reaches(g, c.from, c.to, c.via)
    case 'decoupled': return (g) => reaches(g, c.from, c.to, ASYNC) && !g.edges.some((e) => c.from.includes(kindOf(g, e.source)!) && c.to.includes(kindOf(g, e.target)!))
    case 'noDirect': return (g) => !g.edges.some((e) => c.from.includes(kindOf(g, e.source)!) && c.to.includes(kindOf(g, e.target)!))
    case 'resilient': return (g) => {
      const list = kindsOf(g, c.kinds)
      return list.length > 0 && list.every((n) => {
        const c = n.data.config
        if (n.data.kind === 'sql') return c.multiAz || c.replicas > 0
        if (CATALOG[n.data.kind].scalable) return c.multiAz || (c.autoscale ? c.minInstances : c.instances) >= 2
        return true
      })
    }
    case 'autoscale': return (g) => g.nodes.some((n) => CATALOG[n.data.kind].autoscalable && n.data.config.autoscale) || g.nodes.some((n) => n.data.kind === 'serverless')
    case 'regions': return (g) => new Set(g.nodes.filter((n) => n.data.kind !== 'client' && n.data.config.region !== GLOBAL).map((n) => n.data.config.region)).size >= c.min
    case 'config': return (g) => {
      const list = kindsOf(g, c.kinds)
      if (!list.length) return false
      return list.some((n) => {
        const v = n.data.config[c.field]
        if (c.op === '==') return v === c.value
        return c.op === '>=' ? Number(v) >= Number(c.value) : Number(v) <= Number(c.value)
      })
    }
  }
}

// ------------------------------------------------------------------ compile
const X = 235
const Y = 150

export function buildFromSpec(spec: Pick<ChallengeSpec, 'nodes' | 'edges'>, step: number): Graph {
  const g: Graph = { nodes: [], edges: [] }
  const present = new Set<string>()
  for (const n of spec.nodes) {
    const from = n.from ?? (n.kind === 'client' ? -1 : 0)
    if (step < from || step >= (n.until ?? Infinity)) continue
    let cfg: Partial<NodeConfig> = { ...(n.config ?? {}) }
    for (const [s, patch] of Object.entries(n.at ?? {}).sort((a, b) => Number(a[0]) - Number(b[0]))) {
      if (step >= Number(s)) cfg = { ...cfg, ...patch }
    }
    const id = `n-${n.key}`
    present.add(id)
    g.nodes.push({
      id, type: 'sim', position: { x: n.col * X, y: n.row * Y },
      data: { kind: n.kind, label: n.label ?? CATALOG[n.kind].label, config: defaultConfig(n.kind, cfg), locked: n.kind === 'client' },
    })
  }
  for (const e of spec.edges) {
    const a = `n-${e.a}`
    const b = `n-${e.b}`
    if (step < (e.from ?? -1) || step >= (e.until ?? Infinity) || !present.has(a) || !present.has(b)) continue
    const data: SimEdgeData = { ...DEFAULT_EDGE }
    if (e.mode) data.mode = e.mode
    if (e.filter) data.filter = e.filter
    if (e.weight !== undefined) data.weight = e.weight
    if (e.retries) data.retries = e.retries
    if (e.breaker) data.breaker = e.breaker
    g.edges.push({ id: `e-${e.a}-${e.b}-${e.filter ?? 'any'}`, source: a, target: b, type: 'sim', data })
  }
  return g
}

export function compileSpec(spec: ChallengeSpec): Challenge {
  const checks: DesignCheck[] = spec.checks.map((c) => ({ ...describeCheck(c), test: checkTest(c) }))
  return {
    id: spec.id,
    title: spec.title,
    difficulty: spec.difficulty,
    topic: spec.topic,
    tags: spec.tags ?? [],
    brief: spec.brief,
    concepts: spec.concepts ?? [],
    hints: spec.hints ?? [],
    author: spec.author,
    targets: spec.targets,
    checks,
    steps: spec.steps,
    build: (step) => buildFromSpec(spec, step),
    spec,
  }
}

// ------------------------------------------------------------------ from the board
type Snapshot = { nodes: GraphNode[]; edges: GraphEdge[] }

const cfgDiff = (a: NodeConfig, b: NodeConfig): Partial<NodeConfig> => {
  const d: Record<string, unknown> = {}
  for (const k of Object.keys(b) as (keyof NodeConfig)[]) if (a[k] !== b[k]) d[k] = b[k]
  return d as Partial<NodeConfig>
}

/**
 * Turn board snapshots into spec nodes and edges. `start` is the board the
 * candidate begins with (step -1); `steps` are the reference design after each
 * solution step. Parts keep their ids across snapshots, which is how a part that
 * stays, changes or goes away is recognised.
 */
export function specFromSnapshots(start: Snapshot, steps: Snapshot[]): Pick<ChallengeSpec, 'nodes' | 'edges'> {
  const all = [start, ...steps]
  const nodes: SpecNode[] = []
  const edges: SpecEdge[] = []
  const keyOf = new Map<string, string>()
  const nodeIds = [...new Set(all.flatMap((s) => s.nodes.map((n) => n.id)))]
  nodeIds.forEach((id, i) => {
    const seen = all.map((s) => s.nodes.find((n) => n.id === id))
    const first = seen.findIndex(Boolean)
    const n = seen[first]!
    const key = `p${i + 1}`
    keyOf.set(id, key)
    const lastIdx = seen.length - 1 - [...seen].reverse().findIndex(Boolean)
    const spec: SpecNode = {
      key, kind: n.data.kind, label: n.data.label,
      col: Math.round((n.position.x / X) * 100) / 100, row: Math.round((n.position.y / Y) * 100) / 100,
      config: cfgDiff(defaultConfig(n.data.kind), n.data.config),
      from: first - 1,
    }
    if (lastIdx < seen.length - 1) spec.until = lastIdx
    let prev = n.data.config
    for (let s = first + 1; s <= lastIdx; s++) {
      const cur = seen[s]
      if (!cur) continue
      const d = cfgDiff(prev, cur.data.config)
      if (Object.keys(d).length) spec.at = { ...(spec.at ?? {}), [String(s - 1)]: d }
      prev = cur.data.config
    }
    nodes.push(spec)
  })
  const edgeKey = (e: GraphEdge) => `${e.source}>${e.target}>${e.data?.filter ?? 'any'}`
  const ekeys = [...new Set(all.flatMap((s) => s.edges.map(edgeKey)))]
  for (const k of ekeys) {
    const seen = all.map((s) => s.edges.find((e) => edgeKey(e) === k))
    const first = seen.findIndex(Boolean)
    const e = seen[first]!
    const a = keyOf.get(e.source)
    const b = keyOf.get(e.target)
    if (!a || !b) continue
    const lastIdx = seen.length - 1 - [...seen].reverse().findIndex(Boolean)
    const d = e.data ?? DEFAULT_EDGE
    const spec: SpecEdge = { a, b, from: first - 1 }
    if (d.mode !== 'split') spec.mode = d.mode
    if (d.filter !== 'any') spec.filter = d.filter
    if (d.weight !== 1) spec.weight = d.weight
    if (d.retries) spec.retries = d.retries
    if (d.breaker) spec.breaker = d.breaker
    if (lastIdx < seen.length - 1) spec.until = lastIdx
    edges.push(spec)
  }
  return { nodes, edges }
}

/** Light validation for specs that arrive from links and files. */
export function parseSpec(raw: unknown): ChallengeSpec {
  const s = raw as ChallengeSpec
  if (!s || s.v !== 1 || typeof s.id !== 'string' || typeof s.title !== 'string') throw new Error('Not an ArchSim challenge')
  if (!Array.isArray(s.nodes) || !Array.isArray(s.edges) || !Array.isArray(s.steps) || !Array.isArray(s.checks)) throw new Error('Challenge is missing parts')
  if (!s.targets || typeof s.targets.p99 !== 'number') throw new Error('Challenge has no targets')
  return {
    ...s,
    id: s.id.slice(0, 80),
    title: s.title.slice(0, 120),
    brief: String(s.brief ?? '').slice(0, 2000),
    difficulty: (['Easy', 'Medium', 'Hard'] as const).includes(s.difficulty) ? s.difficulty : 'Medium',
    nodes: s.nodes.filter((n) => n && CATALOG[n.kind]).slice(0, 200),
    edges: s.edges.slice(0, 400),
    checks: s.checks.filter((c) => c && typeof c.type === 'string').slice(0, 20),
  }
}
