import { useState } from 'react'
import type { Advice } from '../sim/advisor'
import { CHALLENGES, TOPICS } from '../sim/scenarios'
import { CATALOG, type Category } from '../sim/catalog'
import { ComparePanel, EstimatePanel, GrowthPanel, LimitPanel } from './Panels'
import { PracticePanel } from './Practice'
import { GLOBAL, getLocation } from '../sim/regions'
import { fmtClock, fmtMoney, fmtMs, fmtNum, fmtPct } from '../format'
import { useApp, useSim, type DockTab, type Sample } from '../store'

// ---------------------------------------------------------------- metrics strip
function Spark({ data, color, invert }: { data: number[]; color: string; invert?: boolean }) {
  if (data.length < 2) return <svg className="spark" />
  const w = 120
  const h = 28
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${invert ? ((v - min) / range) * (h - 4) + 2 : h - 2 - ((v - min) / range) * (h - 4)}`).join(' ')
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" style={{ stroke: color }} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function MetricsStrip() {
  const res = useSim((s) => s.result)
  const history = useSim((s) => s.history)
  const nodes = useApp((s) => s.nodes)
  const select = useApp((s) => s.select)
  if (!res) return null
  const T = res.totals
  const h = (f: (s: Sample) => number) => history.map(f)
  const bottleneck = nodes.find((n) => n.id === T.bottleneckId)
  const availBad = T.availability < 0.999
  return (
    <div className="metrics">
      <Metric label="requests per second" value={fmtNum(T.offered)} sub={T.errors > 0.5 ? `${fmtNum(T.success)} succeed` : undefined}>
        <Spark data={h((s) => s.rps)} color="var(--blue)" />
      </Metric>
      <Metric label={T.errors > 0.5 ? `succeed, ${fmtNum(T.errors)}/s fail` : 'succeed'} value={fmtPct(T.availability, 2)} bad={availBad}>
        <Spark data={h((s) => s.avail)} color={availBad ? 'var(--red)' : 'var(--green)'} />
      </Metric>
      <Metric label="average response" value={fmtMs(T.avgLatency)}>
        <Spark data={h((s) => s.lat)} color="var(--ink-2)" />
      </Metric>
      <Metric label="p99, slowest place" value={fmtMs(T.p99)} bad={T.p99 > 800}>
        <Spark data={h((s) => s.p99)} color="var(--ink-2)" />
      </Metric>
      <Metric label={T.costPerMillion > 0 ? `a month, ${fmtMoney(T.costPerMillion)}/M requests` : 'a month'} value={fmtMoney(T.monthlyCost)}>
        <Spark data={h((s) => s.cost)} color="var(--amber)" />
      </Metric>
      <button className={`metric bottleneck ${T.bottleneckUtil > 0.85 ? 'bad' : ''}`} onClick={() => bottleneck && select({ type: 'node', id: bottleneck.id })} disabled={!bottleneck}>
        <div className="metric-value ellip">{bottleneck ? bottleneck.data.label : 'None yet'}</div>
        <div className="metric-label">{bottleneck ? `busiest part, ${fmtPct(T.bottleneckUtil, 0)} busy` : 'busiest part'}</div>
      </button>
    </div>
  )
}

function Metric({ label, value, sub, bad, children }: { label: string; value: string; sub?: string; bad?: boolean; children?: React.ReactNode }) {
  return (
    <div className={`metric ${bad ? 'bad' : ''}`}>
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}{sub && <span className="metric-sub">, {sub}</span>}</div>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------- dock
export function Dock() {
  const tab = useApp((s) => s.dockTab)
  const setTab = useApp((s) => s.setDockTab)
  const advice = useSim((s) => s.advice)
  const chaos = useApp((s) => s.chaos)
  const challengeId = useApp((s) => s.challengeId)
  const chaosCount = chaos.failedNodes.length + chaos.failedRegions.length + (chaos.failedAZs?.length ?? 0) + chaos.cutEdges.length + Object.keys(chaos.edgeDelay).length + (chaos.trafficMult !== 1 ? 1 : 0)
  const general = advice.filter((a) => !a.cost)
  const costs = advice.filter((a) => a.cost)
  const crit = general.filter((a) => a.severity !== 'tip').length
  const saving = costs.reduce((s, a) => s + (a.saving ?? 0), 0)
  const guide = useApp((s) => s.guide)
  const variantCount = useApp((s) => s.variants.length)
  const interview = useApp((s) => s.interview)
  const tabs: { id: DockTab; label: string; badge?: string | number; tone?: string }[] = [
    { id: 'advisor', label: 'Advisor', badge: general.length || undefined, tone: crit ? 'bad' : 'muted' },
    { id: 'cost', label: 'Cost', badge: saving > 1 ? `save ${fmtMoney(saving)}` : undefined, tone: 'good' },
    { id: 'chaos', label: 'Chaos', badge: chaosCount || undefined, tone: 'bad' },
    { id: 'challenge', label: guide ? 'Solution' : challengeId ? 'Challenge' : 'Challenges', badge: guide ? `step ${guide.step + 1}` : challengeId ? 'active' : undefined, tone: 'live' },
    { id: 'tests', label: 'Stress tests' },
    { id: 'compare', label: 'Compare', badge: variantCount || undefined, tone: 'muted' },
    { id: 'estimate', label: 'Estimate' },
    { id: 'practice', label: 'Practice', badge: interview && !interview.finishedAt ? 'live' : undefined, tone: 'live' },
  ]
  return (
    <section className="dock">
      <div className="dock-tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            {t.label}
            {t.badge !== undefined && <span className={`badge ${t.tone}`}>{t.badge}</span>}
          </button>
        ))}
      </div>
      <div className="dock-body" key={tab}>
        {tab === 'advisor' && <AdvisorPanel />}
        {tab === 'cost' && <CostPanel />}
        {tab === 'chaos' && <ChaosPanel />}
        {tab === 'challenge' && <ChallengePanel />}
        {tab === 'tests' && <TestsPanel />}
        {tab === 'compare' && <ComparePanel />}
        {tab === 'estimate' && <EstimatePanel />}
        {tab === 'practice' && <PracticePanel />}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------- advisor
function AdvisorPanel() {
  const advice = useSim((s) => s.advice).filter((a) => !a.cost)
  const applyFix = useApp((s) => s.applyFix)
  const select = useApp((s) => s.select)
  if (!advice.length)
    return (
      <div className="empty">
        <div className="empty-big">Nothing to fix right now</div>
        <div className="muted">Open Chaos and take something down, or push traffic up five times, and see what holds.</div>
      </div>
    )
  return (
    <div className="advice-list">
      {advice.map((a: Advice) => (
        <div key={a.id} className={`advice sev-${a.severity}`}>
          <div className="advice-sev">{a.severity === 'critical' ? 'Critical' : a.severity === 'warn' ? 'Warning' : 'Tip'}</div>
          <div className="advice-main">
            <button className="advice-title" onClick={() => a.nodeId && select({ type: 'node', id: a.nodeId })} disabled={!a.nodeId}>{a.title}</button>
            <div className="advice-detail">{a.detail}</div>
          </div>
          {a.fix && <button className="btn btn-accent small" onClick={() => applyFix(a.fix!)}>{a.fixLabel ?? 'Fix'}</button>}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------- cost
const GROUPS: { label: string; cats: Category[]; color: string }[] = [
  { label: 'Compute', cats: ['Compute'], color: '#38bdf8' },
  { label: 'Data', cats: ['Data'], color: '#818cf8' },
  { label: 'Messaging', cats: ['Messaging'], color: '#fb923c' },
  { label: 'Edge & delivery', cats: ['Edge'], color: '#c084fc' },
  { label: 'Analytics & AI', cats: ['Analytics & AI'], color: '#f472b6' },
  { label: 'Third-party', cats: ['External'], color: '#94a3b8' },
]

function CostPanel() {
  const res = useSim((s) => s.result)
  const advice = useSim((s) => s.advice).filter((a) => a.cost)
  const nodes = useApp((s) => s.nodes)
  const applyFix = useApp((s) => s.applyFix)
  const select = useApp((s) => s.select)
  if (!res) return null
  const T = res.totals
  const groups = GROUPS.map((g) => ({
    ...g,
    v: nodes.filter((n) => g.cats.includes(CATALOG[n.data.kind].category)).reduce((s, n) => s + (res.nodes[n.id]?.cost ?? 0), 0),
  }))
  groups.push({ label: 'Data transfer', cats: [], color: '#64748b', v: T.egressCost })
  const total = Math.max(1, T.monthlyCost)
  const saving = advice.reduce((s, a) => s + (a.saving ?? 0), 0)
  const fixable = advice.filter((a) => a.fix)
  return (
    <div className="costpanel">
      <div className="cost-side">
        <div className="cost-total">
          <span className="muted small">Per month at today's traffic</span>
          <b>{fmtMoney(T.monthlyCost)}</b>
          {saving > 1 && <span className="ok small">Up to {fmtMoney(saving)} a month could be saved ({fmtPct(saving / total, 0)})</span>}
        </div>
        <div className="stackbar" role="img" aria-label="Cost by category">
          {groups.filter((g) => g.v > 0).map((g) => (
            <span key={g.label} style={{ width: `${(g.v / total) * 100}%`, background: g.color }} title={`${g.label}: ${fmtMoney(g.v)}`} />
          ))}
        </div>
        <ul className="cost-legend">
          {groups.filter((g) => g.v > 0.5).sort((a, b) => b.v - a.v).map((g) => (
            <li key={g.label}><i style={{ background: g.color }} />{g.label}<b>{fmtMoney(g.v)}</b></li>
          ))}
        </ul>
        {fixable.length > 1 && <button className="btn btn-accent small" onClick={() => fixable.forEach((a) => applyFix(a.fix!))}>Apply all {fixable.length} savings</button>}
      </div>
      <div className="advice-list">
        {advice.length ? advice.map((a) => (
          <div key={a.id} className="advice sev-cost">
            <div className="advice-sev">{a.saving ? fmtMoney(a.saving) : 'Save'}</div>
            <div className="advice-main">
              <button className="advice-title" onClick={() => a.nodeId && select({ type: 'node', id: a.nodeId })} disabled={!a.nodeId}>{a.title}</button>
              <div className="advice-detail">{a.detail}</div>
            </div>
            {a.fix && <button className="btn btn-accent small" onClick={() => applyFix(a.fix!)}>{a.fixLabel ?? 'Apply'}</button>}
          </div>
        )) : (
          <div className="empty"><div className="empty-big">Already lean</div><div className="muted">No savings left at this traffic level. Check again at peak and off-peak hours.</div></div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- chaos
function ChaosPanel() {
  const nodes = useApp((s) => s.nodes)
  const edges = useApp((s) => s.edges)
  const chaos = useApp((s) => s.chaos)
  const toggleRegion = useApp((s) => s.toggleRegion)
  const toggleAZ = useApp((s) => s.toggleAZ)
  const toggleNodeFail = useApp((s) => s.toggleNodeFail)
  const toggleEdgeCut = useApp((s) => s.toggleEdgeCut)
  const setEdgeDelay = useApp((s) => s.setEdgeDelay)
  const setTrafficMult = useApp((s) => s.setTrafficMult)
  const flushAll = useApp((s) => s.flushAllCaches)
  const clearChaos = useApp((s) => s.clearChaos)
  const regions = [...new Set(nodes.filter((n) => n.data.kind !== 'client' && n.data.config.region !== GLOBAL).map((n) => n.data.config.region))]
  const killable = nodes.filter((n) => n.data.kind !== 'client' && !chaos.failedNodes.includes(n.id))
  const label = (id: string) => nodes.find((n) => n.id === id)?.data.label ?? id
  const edgeLabel = (id: string) => {
    const e = edges.find((x) => x.id === id)
    return e ? `${label(e.source)} → ${label(e.target)}` : id
  }
  const active = [
    ...chaos.failedNodes.map((id) => ({ k: `n${id}`, text: `${label(id)} is down`, undo: () => toggleNodeFail(id) })),
    ...chaos.failedRegions.map((r) => ({ k: `r${r}`, text: `Region outage: ${getLocation(r)?.name ?? r}`, undo: () => toggleRegion(r) })),
    ...(chaos.failedAZs ?? []).map((r) => ({ k: `a${r}`, text: `One AZ down in ${getLocation(r)?.name ?? r}`, undo: () => toggleAZ(r) })),
    ...chaos.cutEdges.map((id) => ({ k: `c${id}`, text: `Partition: ${edgeLabel(id)}`, undo: () => toggleEdgeCut(id) })),
    ...Object.entries(chaos.edgeDelay).map(([id, ms]) => ({ k: `d${id}`, text: `+${ms} ms on ${edgeLabel(id)}`, undo: () => setEdgeDelay(id, 0) })),
    ...(chaos.trafficMult !== 1 ? [{ k: 'tm', text: `Traffic ×${chaos.trafficMult}`, undo: () => setTrafficMult(1) }] : []),
  ]
  return (
    <div className="chaos">
      <div className="chaos-col">
        <h4>Traffic surge</h4>
        <div className="seg">
          {[1, 2, 5, 10].map((x) => (
            <button key={x} className={chaos.trafficMult === x ? 'on' : ''} onClick={() => setTrafficMult(x)}>×{x}</button>
          ))}
        </div>
        <h4>Lose one availability zone</h4>
        <div className="chips">
          {regions.map((r) => (
            <button key={r} className={`chip ${(chaos.failedAZs ?? []).includes(r) ? 'on' : ''}`} onClick={() => toggleAZ(r)}>{getLocation(r)?.short ?? r}</button>
          ))}
        </div>
        <h4>Lose a whole region</h4>
        <div className="chips">
          {regions.map((r) => (
            <button key={r} className={`chip ${chaos.failedRegions.includes(r) ? 'on' : ''}`} onClick={() => toggleRegion(r)}>{getLocation(r)?.name ?? r}</button>
          ))}
          {!regions.length && <span className="muted small">No regional components yet.</span>}
        </div>
      </div>
      <div className="chaos-col">
        <h4>Break things</h4>
        <div className="btnrow">
          <button className="btn btn-danger" disabled={!killable.length} onClick={() => toggleNodeFail(killable[Math.floor(Math.random() * killable.length)].id)}>Take down something at random</button>
          <button className="btn" onClick={flushAll}>Empty every cache</button>
        </div>
        <p className="muted small">Emptying caches at once sends every request to the database (a thundering herd). To break one thing, click it on the board. In 3D, red beads are failing requests.</p>
      </div>
      <div className="chaos-col">
        <h4>What's broken now</h4>
        {active.length ? (
          <>
            <ul className="active-list">
              {active.map((a) => (
                <li key={a.k}><span>{a.text}</span><button className="iconbtn" onClick={a.undo} aria-label="Undo experiment">↺</button></li>
              ))}
            </ul>
            <button className="btn small" onClick={clearChaos}>Fix everything</button>
          </>
        ) : (
          <div className="muted small">Everything is running.</div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- challenges
function ChallengePanel() {
  const challengeId = useApp((s) => s.challengeId)
  const guide = useApp((s) => s.guide)
  const ch = CHALLENGES.find((c) => c.id === challengeId)
  if (!ch) return <ChallengeList />
  return guide ? <GuidePanel /> : <ActiveChallenge />
}

function ChallengeList() {
  const startChallenge = useApp((s) => s.startChallenge)
  const startGuide = useApp((s) => s.startGuide)
  const passed = useApp((s) => s.passed)
  const [topic, setTopic] = useState<string>('All')
  const list = CHALLENGES.filter((c) => topic === 'All' || c.topic === topic)
  const done = CHALLENGES.filter((c) => passed[c.id]).length
  return (
    <div>
      <div className="progress-row">
        <div className="progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={CHALLENGES.length} aria-valuenow={done} aria-label="Challenges passed">
          <span style={{ width: `${(done / CHALLENGES.length) * 100}%` }} />
        </div>
        <span className="small">{done ? `${done} of ${CHALLENGES.length} passed` : `None passed yet. Pass one by meeting its targets in the 24-hour test.`}</span>
      </div>
      <div className="chips topic-chips">
        {['All', ...TOPICS].map((t) => (
          <button key={t} className={`chip ${topic === t ? 'on-accent' : ''}`} onClick={() => setTopic(t)}>{t}</button>
        ))}
      </div>
      <div className="challenge-grid">
        {list.map((c) => (
          <div key={c.id} className={`ch-card ${passed[c.id] ? 'passed' : ''}`}>
            <div className="ch-top"><b>{c.title}</b><span className={`diff d-${c.difficulty}`}>{c.difficulty}</span></div>
            {passed[c.id] && <div className="passed-note small">Passed {new Date(passed[c.id].at).toLocaleDateString()} at {fmtMoney(passed[c.id].cost)} a month, p99 {fmtMs(passed[c.id].p99)}</div>}
            <div className="muted small">{c.brief}</div>
            <div className="concepts">{c.concepts.slice(0, 4).map((k) => <span key={k}>{k}</span>)}</div>
            <div className="ch-targets small">p99 under {c.targets.p99} ms, {fmtPct(c.targets.availability, 2)} up, under {fmtMoney(c.targets.budget)} a month</div>
            <div className="btnrow">
              <button className="btn btn-accent small" onClick={() => startChallenge(c.id)}>Try it</button>
              <button className="btn small" onClick={() => startGuide(c.id)}>See the solution</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Targets() {
  const challengeId = useApp((s) => s.challengeId)
  const report = useApp((s) => s.dayReport)
  const running = useApp((s) => s.dayRunning)
  const runDayTest = useApp((s) => s.runDayTest)
  const nodes = useApp((s) => s.nodes)
  const edges = useApp((s) => s.edges)
  const res = useSim((s) => s.result)
  const ch = CHALLENGES.find((c) => c.id === challengeId)!
  const T = res?.totals
  const has = T && T.offered > 0
  const rows = [
    { k: 'p99 latency', target: `≤ ${ch.targets.p99} ms`, now: T ? fmtMs(T.p99) : '—', ok: has && T!.p99 <= ch.targets.p99, day: report ? fmtMs(report.dayP99) : null, dayOk: report ? report.dayP99 <= ch.targets.p99 : null },
    { k: 'Availability', target: `≥ ${fmtPct(ch.targets.availability, 2)}`, now: T ? fmtPct(T.availability, 2) : '—', ok: has && T!.availability >= ch.targets.availability, day: report ? fmtPct(report.dayAvailability, 3) : null, dayOk: report ? report.dayAvailability >= ch.targets.availability : null },
    { k: 'Monthly cost', target: `≤ ${fmtMoney(ch.targets.budget)}`, now: T ? fmtMoney(T.monthlyCost) : '—', ok: has && T!.monthlyCost <= ch.targets.budget, day: report ? fmtMoney(report.avgMonthlyCost) : null, dayOk: report ? report.avgMonthlyCost <= ch.targets.budget : null },
  ]
  if (ch.targets.backlogSec) {
    const b = ch.targets.backlogSec
    rows.push({ k: 'Queue delay', target: `≤ ${Math.round(b / 60)} min`, now: T ? `${Math.round((T.maxBacklogSec ?? 0) / 60)} min` : '—', ok: has && (T!.maxBacklogSec ?? 0) <= b, day: report ? `${Math.round(report.maxBacklogSec / 60)} min` : null, dayOk: report ? report.maxBacklogSec <= b : null })
  }
  const checks = ch.checks.map((c) => ({ ...c, pass: c.test({ nodes, edges }) }))
  const passed = report && rows.every((r) => r.dayOk) && checks.every((c) => c.pass)
  return (
    <div className="ch-score">
      <table className="tbl">
        <thead><tr><th>Target</th><th></th><th>Right now</th><th>Over 24 hours</th></tr></thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.k}>
              <td>{c.k}</td>
              <td className="muted">{c.target}</td>
              <td className={c.ok ? 'ok' : 'bad'}>{c.ok ? '✓' : '✗'} {c.now}</td>
              <td className={c.dayOk === null ? 'muted' : c.dayOk ? 'ok' : 'bad'}>{c.day === null ? '—' : `${c.dayOk ? '✓' : '✗'} ${c.day}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4>Design checks</h4>
      <ul className="checks">
        {checks.map((c) => (
          <li key={c.label} className={c.pass ? 'ok' : 'bad'} title={c.why}><span>{c.pass ? '✓' : '✗'}</span><div><b>{c.label}</b><em>{c.why}</em></div></li>
        ))}
      </ul>
      <div className="btnrow">
        <button className="btn btn-accent" onClick={runDayTest} disabled={running}>{running ? 'Running a simulated day…' : 'Run the 24-hour test'}</button>
        {report && <span className={`verdict ${passed ? 'ok' : 'bad'}`}>{passed ? 'Passed' : 'Not passing yet. Fix the rows marked ✗.'}</span>}
      </div>
    </div>
  )
}

function ActiveChallenge() {
  const challengeId = useApp((s) => s.challengeId)
  const loadTemplate = useApp((s) => s.loadTemplate)
  const startGuide = useApp((s) => s.startGuide)
  const [hints, setHints] = useState(0)
  const ch = CHALLENGES.find((c) => c.id === challengeId)!
  return (
    <div className="challenge">
      <div className="ch-brief">
        <div className="ch-top"><b>{ch.title}</b><span className={`diff d-${ch.difficulty}`}>{ch.difficulty}</span></div>
        <p className="small">{ch.brief}</p>
        <div className="concepts">{ch.concepts.map((k) => <span key={k}>{k}</span>)}</div>
        <div className="hints">
          {ch.hints.slice(0, hints).map((h) => <div key={h} className="hint">{h}</div>)}
          {hints < ch.hints.length && <button className="linkbtn small" onClick={() => setHints(hints + 1)}>Show a hint ({hints}/{ch.hints.length})</button>}
        </div>
        <div className="btnrow">
          <button className="btn small" onClick={() => startGuide(ch.id)}>Stuck? See the solution</button>
          <button className="linkbtn small" onClick={() => loadTemplate('blank')}>Leave challenge</button>
        </div>
      </div>
      <Targets />
    </div>
  )
}

function GuidePanel() {
  const guide = useApp((s) => s.guide)!
  const guideTo = useApp((s) => s.guideTo)
  const exitGuide = useApp((s) => s.exitGuide)
  const ch = CHALLENGES.find((c) => c.id === guide.challengeId)!
  const st = ch.steps[guide.step]
  const last = guide.step === ch.steps.length - 1
  return (
    <div className="challenge">
      <div className="ch-brief guide">
        <div className="ch-top"><b>How to build {ch.title}</b><span className="muted small">Step {guide.step + 1} of {ch.steps.length}</span></div>
        <ol className="steps">
          {ch.steps.map((x, i) => (
            <li key={x.title} className={i === guide.step ? 'cur' : i < guide.step ? 'done' : ''}>
              <button onClick={() => guideTo(i)}>{x.title}</button>
            </li>
          ))}
        </ol>
        <div className="step-why"><b>{st.title}.</b> {st.why}</div>
        <div className="btnrow">
          <button className="btn" onClick={() => guideTo(guide.step - 1)} disabled={guide.step === 0}>Previous</button>
          <button className="btn btn-accent" onClick={() => guideTo(guide.step + 1)} disabled={last}>Next step</button>
          <button className="linkbtn small" onClick={exitGuide}>Try it yourself</button>
        </div>
      </div>
      <Targets />
    </div>
  )
}

// ---------------------------------------------------------------- 24h test
function TestsPanel() {
  const [mode, setMode] = useState<'limit' | 'day' | 'growth'>(() => (useApp.getState().dayReport && !useApp.getState().limitReport ? 'day' : 'limit'))
  return (
    <div>
      <div className="seg tests-seg">
        <button className={mode === 'limit' ? 'on' : ''} onClick={() => setMode('limit')}>Breaking point</button>
        <button className={mode === 'day' ? 'on' : ''} onClick={() => setMode('day')}>A full day</button>
        <button className={mode === 'growth' ? 'on' : ''} onClick={() => setMode('growth')}>The next 12 months</button>
      </div>
      {mode === 'limit' ? <LimitPanel /> : mode === 'day' ? <DayTestPanel /> : <GrowthPanel />}
    </div>
  )
}

function DayTestPanel() {
  const report = useApp((s) => s.dayReport)
  const running = useApp((s) => s.dayRunning)
  const runDayTest = useApp((s) => s.runDayTest)
  return (
    <div className="daytest">
      <div className="day-side">
        <p className="small">Plays a full day minute by minute, with the traffic pattern, autoscaling delays and queue build-up, and reports the worst moments. Anything you've broken stays broken.</p>
        <button className="btn btn-accent" onClick={runDayTest} disabled={running}>{running ? 'Running a simulated day…' : report ? 'Run it again' : 'Run the 24-hour test'}</button>
        {report && (
          <div className="day-stats">
            <div><span>Peak traffic</span><b>{fmtNum(report.peakRps)}/s</b></div>
            <div><span>Day availability</span><b className={report.dayAvailability < 0.999 ? 'bad' : 'ok'}>{fmtPct(report.dayAvailability, 3)}</b></div>
            <div><span>Worst minute</span><b className={report.minAvailability < 0.99 ? 'bad' : ''}>{fmtPct(report.minAvailability, 2)} at {String(report.worstHour).padStart(2, '0')}:00</b></div>
            <div><span>p99 (day)</span><b>{fmtMs(report.dayP99)}</b></div>
            <div><span>Worst p99</span><b>{fmtMs(report.worstP99)}</b></div>
            <div><span>Avg monthly cost</span><b>{fmtMoney(report.avgMonthlyCost)}</b></div>
          </div>
        )}
      </div>
      {report ? <DayChart report={report} /> : <div className="empty"><div className="muted">No run yet.</div></div>}
    </div>
  )
}

function DayChart({ report }: { report: NonNullable<ReturnType<typeof useApp.getState>['dayReport']> }) {
  const W = 640
  const H = 150
  const pad = { l: 36, r: 36, t: 10, b: 20 }
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b
  const hrs = report.hours
  const maxR = Math.max(1, ...hrs.map((h) => h.offered))
  const maxP = Math.max(1, ...hrs.map((h) => h.p99))
  const x = (i: number) => pad.l + (i / 23) * iw
  const bw = iw / 24 - 3
  const pLine = hrs.map((h, i) => `${x(i)},${pad.t + ih - (h.p99 / maxP) * ih}`).join(' ')
  return (
    <div className="daychart">
      <div className="legend small">
        <span><i style={{ background: 'color-mix(in srgb, var(--blue) 30%, transparent)' }} />Busiest minute each hour</span>
        <span><i style={{ background: 'var(--ink)' }} />p99 latency</span>
        <span><i style={{ background: 'var(--red)' }} />Hours with errors</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Traffic and latency over 24 hours">
        {[0, 0.5, 1].map((g) => (
          <line key={g} className="gridl" x1={pad.l} x2={W - pad.r} y1={pad.t + ih * g} y2={pad.t + ih * g} strokeWidth="1" />
        ))}
        {hrs.map((h, i) => {
          const bh = (h.offered / maxR) * ih
          return (
            <g key={i}>
              <rect x={x(i) - bw / 2} y={pad.t + ih - bh} width={bw} height={bh} rx="2" className={h.availability < 0.999 ? 'bar err' : 'bar'}>
                <title>{`${String(h.hour).padStart(2, '0')}:00: ${fmtNum(h.offered)}/s at peak, ${fmtPct(h.availability, 2)} ok, p99 ${fmtMs(h.p99)}`}</title>
              </rect>
              {i % 3 === 0 && <text x={x(i)} y={H - 5} fontSize="10" textAnchor="middle">{fmtClock(h.hour * 3600)}</text>}
            </g>
          )
        })}
        <polyline className="p99" points={pLine} fill="none" strokeWidth="1.8" strokeLinejoin="round" />
        <text x={4} y={pad.t + 8} fontSize="10">{fmtNum(maxR)}/s</text>
        <text x={W - 4} y={pad.t + 8} fontSize="10" textAnchor="end">{fmtMs(maxP)}</text>
      </svg>
    </div>
  )
}

