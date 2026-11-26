import { describe, expect, it } from 'vitest'
import LZString from 'lz-string'
import { EXTRA_PROBLEMS } from '../problems'
import { buildFromSpec, compileSpec, parseSpec, specFromSnapshots, type ChallengeSpec } from '../spec'
import type { Graph } from '../scenarios'

// what a candidate would see: kinds, settings and wiring, ignoring ids and positions
const shape = (g: Graph) => ({
  nodes: g.nodes.map((n) => `${n.data.kind}:${n.data.label}:${JSON.stringify(n.data.config)}`).sort(),
  edges: g.edges
    .map((e) => {
      const a = g.nodes.find((n) => n.id === e.source)!.data.label
      const b = g.nodes.find((n) => n.id === e.target)!.data.label
      return `${a}>${b}:${JSON.stringify(e.data)}`
    })
    .sort(),
})

describe('challenge specs', () => {
  it.each(EXTRA_PROBLEMS.map((p) => [p.id, p] as const))('%s survives a round trip through board snapshots', (_, spec) => {
    const start = buildFromSpec(spec, -1)
    const steps = spec.steps.map((_, i) => buildFromSpec(spec, i))
    const back = specFromSnapshots(start, steps)
    expect(shape(buildFromSpec(back, -1))).toEqual(shape(start))
    steps.forEach((g, i) => expect(shape(buildFromSpec(back, i)), `step ${i + 1}`).toEqual(shape(g)))
  })

  it('a spec survives being sent as a link', () => {
    const spec = EXTRA_PROBLEMS[0]
    const raw = LZString.decompressFromEncodedURIComponent(LZString.compressToEncodedURIComponent(JSON.stringify(spec)))
    const parsed = parseSpec(JSON.parse(raw!))
    expect(compileSpec(parsed).build(spec.steps.length - 1).nodes.length).toBe(buildFromSpec(spec, spec.steps.length - 1).nodes.length)
  })

  it('rejects things that are not challenges', () => {
    expect(() => parseSpec(null)).toThrow()
    expect(() => parseSpec({ v: 2, id: 'x', title: 'x' })).toThrow()
    expect(() => parseSpec({ v: 1, id: 'x', title: 'x', nodes: [], edges: [], steps: [], checks: [] })).toThrow(/targets/)
  })

  it('cleans what it accepts', () => {
    const junk = {
      ...EXTRA_PROBLEMS[0],
      title: 'x'.repeat(500),
      difficulty: 'Impossible',
      nodes: [...EXTRA_PROBLEMS[0].nodes, { key: 'bad', kind: 'warp-drive', col: 0, row: 0 }],
      checks: [...EXTRA_PROBLEMS[0].checks, null],
    } as unknown as ChallengeSpec
    const s = parseSpec(junk)
    expect(s.title.length).toBe(120)
    expect(s.difficulty).toBe('Medium')
    expect(s.nodes.some((n) => n.key === 'bad')).toBe(false)
    expect(s.checks.every(Boolean)).toBe(true)
  })
})

import md from '../../../docs/FORMAT.md?raw'
import { runDay } from '../engine'
import { emptyChaos } from '../types'

describe('docs/FORMAT.md challenge example', () => {
  const block = [...md.matchAll(/```jsonc\n([\s\S]*?)```/g)][1][1]
  const spec = parseSpec(JSON.parse(block.replace(/\s\/\/.*$/gm, '')))
  const ch = compileSpec(spec)

  it('starts with only the users and ends meeting its targets and checks', () => {
    expect(ch.build(-1).nodes.every((n) => n.data.kind === 'client')).toBe(true)
    const last = ch.build(spec.steps.length - 1)
    const day = runDay(last.nodes, last.edges, emptyChaos(), 120)
    expect(day.dayAvailability).toBeGreaterThanOrEqual(spec.targets.availability)
    expect(day.dayP99).toBeLessThanOrEqual(spec.targets.p99)
    expect(day.avgMonthlyCost).toBeLessThanOrEqual(spec.targets.budget)
    for (const c of ch.checks) expect(c.test(last), c.label).toBe(true)
  })
})
