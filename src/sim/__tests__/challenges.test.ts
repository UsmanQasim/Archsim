import { describe, expect, it } from 'vitest'
import { runDay } from '../engine'
import { CHALLENGES } from '../challenges'
import { emptyChaos } from '../types'

// Every challenge ships with a guided reference solution. Its last step must
// pass the challenge's own targets and design checks, or the challenge is unfair.
describe('reference solutions pass their challenge', () => {
  for (const c of CHALLENGES) {
    it(c.title, () => {
      const g = c.build(c.steps.length - 1)
      const day = runDay(g.nodes, g.edges, emptyChaos(), 120)
      expect(day.dayAvailability, 'availability').toBeGreaterThanOrEqual(c.targets.availability)
      expect(day.dayP99, 'p99 latency').toBeLessThanOrEqual(c.targets.p99)
      expect(day.avgMonthlyCost, 'monthly cost').toBeLessThanOrEqual(c.targets.budget)
      if (c.targets.backlogSec) expect(day.maxBacklogSec, 'queue backlog').toBeLessThanOrEqual(c.targets.backlogSec)
      for (const check of c.checks) expect(check.test(g), check.label).toBe(true)
    })
  }

  it('starting boards do not already pass', () => {
    for (const c of CHALLENGES) {
      const g = c.build(0)
      const day = runDay(g.nodes, g.edges, emptyChaos(), 120)
      const passes =
        day.dayAvailability >= c.targets.availability &&
        day.dayP99 <= c.targets.p99 &&
        day.avgMonthlyCost <= c.targets.budget &&
        c.checks.every((k) => k.test(g))
      expect(passes, c.id).toBe(false)
    }
  })
})
