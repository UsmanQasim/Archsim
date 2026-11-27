/**
 * Suggest targets for problems written as data.
 *   npx vite-node scripts/calibrate.ts /abs/path/src/sim/problems2.ts MORE_PROBLEMS
 * Runs each reference answer through the 24-hour test, prints what it achieves,
 * flags starting boards that already pass, and writes suggested targets to /tmp/targets.json.
 */
import { runDay } from '../src/sim/engine'
import { compileSpec, type ChallengeSpec } from '../src/sim/spec'
import { emptyChaos } from '../src/sim/types'

const [mod, name] = process.argv.slice(2)
const m = await import(mod)
const specs: ChallengeSpec[] = m[name]
type Targets = { p99: number; availability: number; budget: number; backlogSec?: number }
const out: Record<string, Targets> = {}
for (const s of specs) {
  const c = compileSpec(s)
  const fin = c.build(c.steps.length - 1)
  const d = runDay(fin.nodes, fin.edges, emptyChaos(), 120)
  const p99 = Math.ceil((d.dayP99 * 1.15 + 5) / 10) * 10
  const r = d.avgMonthlyCost < 100000 ? 1000 : 10000
  const budget = Math.ceil((d.avgMonthlyCost * 1.15) / r) * r
  const availability = d.dayAvailability >= 0.999 ? 0.999 : d.dayAvailability >= 0.995 ? 0.995 : d.dayAvailability >= 0.99 ? 0.99 : 0
  const t: Targets = { p99, availability, budget }
  if (s.targets.backlogSec) t.backlogSec = Math.max(s.targets.backlogSec, Math.ceil(d.maxBacklogSec * 1.5 + 5))
  out[s.id] = t
  const failing = c.checks.filter((k) => !k.test(fin)).map((k) => k.label)
  const g0 = c.build(0)
  const d0 = runDay(g0.nodes, g0.edges, emptyChaos(), 120)
  const pass0 = d0.dayAvailability >= availability && d0.dayP99 <= p99 && d0.avgMonthlyCost <= budget && c.checks.every((k) => k.test(g0))
  console.log(`${s.id.padEnd(22)} avail ${(d.dayAvailability * 100).toFixed(3)} p99 ${d.dayP99.toFixed(0).padStart(5)} cost ${d.avgMonthlyCost.toFixed(0).padStart(8)} bl ${d.maxBacklogSec.toFixed(0)} | s0 avail ${(d0.dayAvailability * 100).toFixed(2)} p99 ${d0.dayP99.toFixed(0)} cost ${d0.avgMonthlyCost.toFixed(0)}${pass0 ? '  !! STEP0 PASSES' : ''}${availability === 0 ? '  !! LOW AVAIL' : ''}${failing.length ? '  !! CHECKS FAIL: ' + failing.join('; ') : ''}`)
}
const fs = await import('node:fs')
fs.writeFileSync('/tmp/targets.json', JSON.stringify(out, null, 1))
