import { advise } from './sim/advisor'
import { step } from './sim/engine'
import { useApp, useSim, type Sample } from './store'

const TICK_MS = 100

/** Drives the simulation: advances the clock while playing, recomputes instantly on edits when paused. */
export function startSimLoop(): () => void {
  let last: unknown[] = []
  let lastAdviceAt = 0
  const run = () => {
    const s = useApp.getState()
    const dt = s.playing ? (s.speed * TICK_MS) / 1000 : 0
    const inputs = [s.nodes, s.edges, s.chaos, s.time]
    if (!s.playing && inputs.every((x, i) => x === last[i])) return
    const time = s.time + dt
    const sim = useSim.getState()
    let out = step({ nodes: s.nodes, edges: s.edges, chaos: s.chaos, runtime: sim.runtime, time, dt })
    // when paused, settle feedback loops (retries) so the view reflects a steady state
    if (!s.playing) for (let i = 0; i < 4; i++) out = step({ nodes: s.nodes, edges: s.edges, chaos: s.chaos, runtime: out.runtime, time, dt: 0 })
    if (s.playing) useApp.setState({ time })
    last = [s.nodes, s.edges, s.chaos, time]
    const T = out.result.totals
    const sample: Sample = { t: time, rps: T.offered, avail: T.availability, lat: T.avgLatency, p99: T.p99, cost: T.monthlyCost }
    const history = s.playing || sim.history.length === 0 ? [...sim.history.slice(-149), sample] : [...sim.history.slice(0, -1), sample]
    const now = performance.now()
    let advice = sim.advice
    if (!s.playing || now - lastAdviceAt > 500) {
      advice = advise(s.nodes, s.edges, out.result)
      lastAdviceAt = now
    }
    useSim.setState({ result: out.result, runtime: out.runtime, history, advice })
  }
  run()
  const id = setInterval(run, TICK_MS)
  return () => clearInterval(id)
}
