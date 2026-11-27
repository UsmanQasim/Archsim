import { describe, expect, it } from 'vitest'
import { advise, type Fix } from '../advisor'
import { DEFAULT_EDGE, step } from '../engine'
import { steadyState } from '../analysis'
import { defaultConfig } from '../catalog'
import { TEMPLATES, CHALLENGES } from '../scenarios'
import { emptyChaos, type GraphEdge, type GraphNode, type Runtime } from '../types'

type G = { nodes: GraphNode[]; edges: GraphEdge[] }
let seq = 0
function apply(g: G, f: Fix): G {
  const nodes = structuredClone(g.nodes); const edges = structuredClone(g.edges)
  if (f.type === 'patch') { const n = nodes.find((x) => x.id === f.nodeId)!; n.data.config = { ...n.data.config, ...f.patch } }
  else if (f.type === 'edge') { const e = edges.find((x) => x.id === f.edgeId)!; e.data = { ...e.data!, ...f.patch } }
  else {
    const anchor = nodes.find((x) => x.id === f.nodeId)!
    const id = `fx${seq++}`
    nodes.push({ id, position: { x: 0, y: 0 }, data: { kind: f.kind, label: f.kind, config: defaultConfig(f.kind, { region: anchor.data.config.region, ...(f.patch ?? {}) }) } } as GraphNode)
    if (f.type === 'insertBefore') {
      for (const e of edges) if (e.target === anchor.id) e.target = id
      edges.push({ id: `e${id}`, source: id, target: anchor.id, data: { ...DEFAULT_EDGE } })
    } else {
      for (const e of edges) if (e.source === anchor.id) e.source = id
      edges.push({ id: `e${id}`, source: anchor.id, target: id, data: { ...DEFAULT_EDGE } })
    }
  }
  return { nodes, edges }
}
const scaleUsers = (g: G, k: number): G => ({ nodes: g.nodes.map((n) => n.data.kind === 'client' ? { ...n, data: { ...n.data, config: { ...n.data.config, users: n.data.config.users * k } } } : n), edges: g.edges })

function loopSteady(name: string, g: G): string | undefined {
  const seen: Record<string, number> = {}
  const log: string[] = []
  for (let i = 0; i < 14; i++) {
    const r = steadyState(g.nodes, g.edges, emptyChaos())
    const adv = advise(g.nodes, g.edges, r).filter((a) => a.fix && !a.cost)
    if (!adv.length) return
    const a = adv[0]
    const key = `${a.id} ${a.fixLabel}`
    seen[key] = (seen[key] ?? 0) + 1
    log.push(`${a.title} -> ${a.fixLabel}`)
    if (seen[key] >= 3) return `${name}: the same fix keeps coming back\n  ` + log.slice(-4).join('\n  ')
    g = apply(g, a.fix!)
  }
}
function loopLive(name: string, g: G): string | undefined {
  let rt: Runtime = { instances: {}, cooldown: {}, backlog: {}, prevSuccess: {} }
  let time = 9 * 3600
  const seen: Record<string, number> = {}
  const log: string[] = []
  for (let i = 0; i < 14; i++) {
    let out
    for (let t = 0; t < 20; t++) { time += 6; out = step({ nodes: g.nodes, edges: g.edges, chaos: emptyChaos(), runtime: rt, time, dt: 6 }); rt = out.runtime }
    const adv = advise(g.nodes, g.edges, out!.result).filter((a) => a.fix && !a.cost)
    if (!adv.length) return
    const a = adv[0]
    const key = `${a.id} ${a.fixLabel}`
    seen[key] = (seen[key] ?? 0) + 1
    log.push(`${a.title} -> ${a.fixLabel}`)
    if (seen[key] >= 3) return `${name} (live): the same fix keeps coming back\n  ` + log.slice(-4).join('\n  ')
    g = apply(g, a.fix!)
  }
}
// Clicking an advisor fix must change something: the same suggestion with the same button
// must not come back again and again. Applies the top fix repeatedly on every built-in design.
describe('advisor fixes', () => {
  const cases: [string, G][] = [
    ...TEMPLATES.flatMap((t) => [1, 10].map((k) => [`${t.id} x${k}`, scaleUsers(t.build(), k)] as [string, G])),
    ...CHALLENGES.flatMap((c) => [1, 10].map((k) => [`${c.id} x${k}`, scaleUsers(c.build(c.steps.length - 1), k)] as [string, G])),
  ]
  it.each(cases)('%s converges', (_, g) => {
    expect(loopSteady(_, g)).toBeUndefined()
    expect(loopLive(_, g)).toBeUndefined()
  })
})
