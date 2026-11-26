import { describe, expect, it } from 'vitest'
import md from '../../../docs/FORMAT.md?raw'
import { CATALOG, defaultConfig } from '../catalog'
import { DEFAULT_EDGE } from '../engine'
import { steadyState } from '../analysis'
import { emptyChaos, type GraphEdge, type GraphNode, type NodeKind } from '../types'

// docs/FORMAT.md is the public contract for designs; keep its example valid.
describe('docs/FORMAT.md example', () => {
  const block = md.match(/```jsonc\n([\s\S]*?)```/)![1]
  const json = JSON.parse(block.replace(/\s\/\/.*$/gm, ''))

  it('uses only real component kinds', () => {
    for (const n of json.nodes) expect(CATALOG[n.d.kind as NodeKind], n.d.kind).toBeDefined()
  })

  it('runs and serves its users', () => {
    const nodes: GraphNode[] = json.nodes.map((n: { id: string; d: { kind: NodeKind; label: string; config: object } }) => ({
      id: n.id, data: { kind: n.d.kind, label: n.d.label, config: defaultConfig(n.d.kind, n.d.config) },
    }))
    const edges: GraphEdge[] = json.edges.map((e: { id: string; s: string; t: string; d?: object }) => ({
      id: e.id, source: e.s, target: e.t, data: { ...DEFAULT_EDGE, ...(e.d ?? {}) },
    }))
    const r = steadyState(nodes, edges, emptyChaos(), 1)
    expect(r.totals.offered).toBeGreaterThan(0)
    expect(r.totals.availability).toBeGreaterThan(0.99)
  })
})
