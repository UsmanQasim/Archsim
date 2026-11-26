import { describe, expect, it } from 'vitest'
import { runDay } from '../engine'
import { findLimit, growthPlan, steadyState } from '../analysis'
import { TEMPLATES } from '../scenarios'
import { emptyChaos } from '../types'

const template = (id: string) => {
  const t = TEMPLATES.find((x) => x.id === id)
  if (!t) throw new Error(`no template ${id}`)
  return t.build()
}

describe('engine', () => {
  it('an empty board costs nothing and serves nothing', () => {
    const r = steadyState([], [], emptyChaos(), 1)
    expect(r.totals.offered).toBe(0)
    expect(r.totals.monthlyCost).toBe(0)
  })

  for (const t of TEMPLATES.filter((x) => x.id !== 'blank')) {
    it(`template "${t.title}" runs a full day with sane numbers`, () => {
      const g = t.build()
      const d = runDay(g.nodes, g.edges, emptyChaos(), 300)
      expect(d.dayAvailability).toBeGreaterThan(0)
      expect(d.dayAvailability).toBeLessThanOrEqual(1)
      expect(Number.isFinite(d.dayP99)).toBe(true)
      expect(d.avgMonthlyCost).toBeGreaterThan(0)
    })
  }

  it('more traffic never makes latency better', () => {
    const g = TEMPLATES.find((x) => x.id !== 'blank')!.build()
    const a = steadyState(g.nodes, g.edges, emptyChaos(), 1).totals.p99
    const b = steadyState(g.nodes, g.edges, emptyChaos(), 4).totals.p99
    expect(b).toBeGreaterThanOrEqual(a * 0.98)
  })

  it('losing the only region takes the service down', () => {
    const g = TEMPLATES.find((x) => x.id !== 'blank')!.build()
    const regions = [...new Set(g.nodes.filter((n) => n.data.kind !== 'client').map((n) => n.data.config.region))]
    const chaos = { ...emptyChaos(), failedRegions: regions }
    const r = steadyState(g.nodes, g.edges, chaos, 1)
    expect(r.totals.availability).toBeLessThan(0.5)
  })
})

describe('analysis', () => {
  const g = template(TEMPLATES[1].id)

  it('breaking point finds a multiplier and names a part', () => {
    const lim = findLimit(g.nodes, g.edges, emptyChaos())
    expect(lim.points.length).toBeGreaterThan(1)
  })

  it('growth plan is monotonic in traffic and flags budget overruns', () => {
    const rep = growthPlan(g.nodes, g.edges, emptyChaos(), 0.25, 1)
    expect(rep.months).toHaveLength(13)
    for (let i = 1; i < rep.months.length; i++) expect(rep.months[i].offered).toBeGreaterThan(rep.months[i - 1].offered)
    expect(rep.overAt).toBe(0)
  })

  it('zero growth never breaks a design that works today', () => {
    const rep = growthPlan(g.nodes, g.edges, emptyChaos(), 0, null)
    if (rep.months[0].broken) return
    expect(rep.breaksAt).toBeNull()
  })
})
