import { useMemo, useState } from 'react'
import { fmtMoney, fmtMs, fmtNum, fmtPct } from '../format'
import { measure, useApp } from '../store'
import { growthPlan, type GrowthReport } from '../sim/analysis'
import { CHALLENGES } from '../sim/scenarios'

// ---------------------------------------------------------------- breaking point
export function LimitPanel() {
  const report = useApp((s) => s.limitReport)
  const running = useApp((s) => s.limitRunning)
  const runLimit = useApp((s) => s.runLimit)
  const nodes = useApp((s) => s.nodes)
  const select = useApp((s) => s.select)
  const breaker = report?.breakerId ? nodes.find((n) => n.id === report.breakerId) : undefined
  return (
    <div className="daytest">
      <div className="day-side">
        <p className="small">Turns traffic up step by step (×1.5, ×2, ×3 … ×20 of today's peak) and lets autoscaling catch up at each step. It stops at the first step where more than 0.1 % of requests fail or p99 doubles.</p>
        <button className="btn btn-accent" onClick={runLimit} disabled={running || !nodes.length}>{running ? 'Turning up the traffic…' : report ? 'Run it again' : 'Find the breaking point'}</button>
        {report && (
          <div className="limit-verdict">
            {report.breakAt === null ? (
              <p><b>Survived 20× today's peak.</b> That's {fmtNum(report.points[report.points.length - 1].offered)} requests per second with nothing giving out.</p>
            ) : (
              <>
                <p>
                  <b>Handles {report.safeRps > 0 ? `${fmtNum(report.safeRps)} req/s` : 'less than today’s peak'}</b>
                  {report.safeRps > 0 && <>, about {(report.safeRps / Math.max(1, report.baseRps)).toFixed(1)}× today's peak</>}.
                </p>
                <p>
                  At ×{report.breakAt}, {breaker ? <button className="linkbtn" onClick={() => select({ type: 'node', id: breaker.id })}>{breaker.data.label}</button> : 'the system'} gives out first. Scale or protect it, then run this again.
                </p>
              </>
            )}
          </div>
        )}
      </div>
      {report ? <LimitChart /> : <div className="empty"><div className="muted">Find out how much headroom this design has before something breaks.</div></div>}
    </div>
  )
}

function LimitChart() {
  const report = useApp((s) => s.limitReport)!
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const pts = report.points
  const W = 640
  const H = 160
  const pad = { l: 44, r: 50, t: 12, b: 24 }
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b
  const maxP = Math.max(100, ...pts.map((p) => Math.min(p.p99, 5000)))
  const x = (i: number) => pad.l + (pts.length > 1 ? (i / (pts.length - 1)) * iw : iw / 2)
  const yA = (a: number) => pad.t + ih - Math.max(0, (a - 0.9) / 0.1) * ih
  const yP = (p: number) => pad.t + ih - (Math.min(p, 5000) / maxP) * ih
  const hov = hoverIdx !== null ? pts[hoverIdx] : null
  return (
    <div className="daychart">
      <div className="chart-head">
        <div className="legend small">
          <span><i style={{ background: 'var(--green)' }} />Requests that succeed (90–100 %)</span>
          <span><i style={{ background: 'var(--ink)' }} />p99 latency</span>
        </div>
        <div className="chart-tip">
          {hov
            ? `×${hov.mult}: ${fmtNum(hov.offered)} req/s · ${fmtPct(hov.availability, 2)} ok · p99 ${fmtMs(hov.p99)} · ${fmtMoney(hov.cost)}/mo`
            : 'Hover a multiplier point for details'}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Availability and latency as traffic increases" onMouseLeave={() => setHoverIdx(null)}>
        {[0, 0.5, 1].map((g) => <line key={g} className="gridl" x1={pad.l} x2={W - pad.r} y1={pad.t + ih * g} y2={pad.t + ih * g} />)}
        <polyline points={pts.map((p, i) => `${x(i)},${yA(p.availability)}`).join(' ')} fill="none" style={{ stroke: 'var(--green)' }} strokeWidth="2" strokeLinejoin="round" />
        <polyline className="p99" points={pts.map((p, i) => `${x(i)},${yP(p.p99)}`).join(' ')} fill="none" strokeWidth="2" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <g key={p.mult} onMouseEnter={() => setHoverIdx(i)} style={{ cursor: 'crosshair' }}>
            <rect x={x(i) - 14} y={pad.t} width={28} height={ih} fill="transparent" />
            <circle cx={x(i)} cy={yA(p.availability)} r={hoverIdx === i ? 5 : 3.5} style={{ fill: report.breakAt === p.mult ? 'var(--red)' : 'var(--green)' }}>
              <title>{`×${p.mult}: ${fmtNum(p.offered)} req/s, ${fmtPct(p.availability, 2)} succeed, p99 ${fmtMs(p.p99)}, ${fmtMoney(p.cost)}/mo`}</title>
            </circle>
            <text x={x(i)} y={H - 6} fontSize="10.5" textAnchor="middle">×{p.mult}</text>
          </g>
        ))}
        <text x={4} y={pad.t + 9} fontSize="10.5">100 %</text>
        <text x={4} y={pad.t + ih} fontSize="10.5">90 %</text>
        <text x={W - 4} y={pad.t + 9} fontSize="10.5" textAnchor="end">{fmtMs(maxP)}</text>
      </svg>
    </div>
  )
}

// ---------------------------------------------------------------- growth plan
const MONTHS = ['Now', 'Month 1', 'Month 2', 'Month 3', 'Month 4', 'Month 5', 'Month 6', 'Month 7', 'Month 8', 'Month 9', 'Month 10', 'Month 11', 'Month 12']

export function GrowthPanel() {
  const nodes = useApp((s) => s.nodes)
  const select = useApp((s) => s.select)
  const challengeId = useApp((s) => s.challengeId)
  const ch = CHALLENGES.find((c) => c.id === challengeId)
  const [growth, setGrowth] = useState(15)
  const [budget, setBudget] = useState<string>(() => (ch ? String(ch.targets.budget) : ''))
  const [report, setReport] = useState<GrowthReport | null>(null)
  const [running, setRunning] = useState(false)
  const run = () => {
    setRunning(true)
    setTimeout(() => {
      const s = useApp.getState()
      const b = Number(budget)
      const c = CHALLENGES.find((x) => x.id === s.challengeId)
      setReport(growthPlan(s.nodes, s.edges, s.chaos, growth / 100, budget.trim() && b > 0 ? b : null, c ? { p99: c.targets.p99, availability: c.targets.availability } : undefined))
      setRunning(false)
    }, 30)
  }
  const breaker = report?.breakerId ? nodes.find((n) => n.id === report.breakerId) : undefined
  const last = report?.months[report.months.length - 1]
  return (
    <div className="daytest">
      <div className="day-side">
        <p className="small">Grows your traffic month by month for a year and checks each month against {ch ? 'this challenge’s targets' : 'the usual targets (99.9 % succeed, p99 no more than double today’s)'} and your budget.</p>
        <div className="growth-inputs">
          <label className="field">
            <span>Traffic grows by</span>
            <span className="unit-input"><input type="number" min={1} max={100} value={growth} onChange={(e) => setGrowth(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} /> % a month</span>
          </label>
          <label className="field">
            <span>Monthly budget</span>
            <span className="unit-input">$ <input type="number" min={0} value={budget} placeholder="none" onChange={(e) => setBudget(e.target.value)} /></span>
          </label>
        </div>
        <button className="btn btn-accent" onClick={run} disabled={running || !nodes.length}>{running ? 'Playing out the year…' : report ? 'Run it again' : 'Plan the next 12 months'}</button>
        {report && last && (
          <div className="limit-verdict">
            {report.breaksAt === null ? (
              <p><b>Holds up all year.</b> In 12 months traffic is {last.mult.toFixed(1)}× today's, {fmtNum(last.offered)} req/s, and it still meets the targets.</p>
            ) : report.breaksAt === 0 ? (
              <p><b>Already misses the targets today.</b> Fix {breaker ? <button className="linkbtn" onClick={() => select({ type: 'node', id: breaker.id })}>{breaker.data.label}</button> : 'the busiest part'} first.</p>
            ) : (
              <p>
                <b>Good for {report.breaksAt === 1 ? 'this month only' : `${report.breaksAt} months`}.</b> In month {report.breaksAt}, at {report.months[report.breaksAt].mult.toFixed(1)}× today's traffic, {breaker ? <button className="linkbtn" onClick={() => select({ type: 'node', id: breaker.id })}>{breaker.data.label}</button> : 'the system'} can't keep up. Plan that upgrade before then.
              </p>
            )}
            {report.budget !== null && (
              report.overAt === null
                ? <p>Stays under {fmtMoney(report.budget)} a month the whole year, ending at {fmtMoney(last.cost)}.</p>
                : <p className={report.overAt === 0 ? 'bad' : ''}>{report.overAt === 0 ? `Already over the ${fmtMoney(report.budget)} budget.` : `Goes over the ${fmtMoney(report.budget)} budget in ${MONTHS[report.overAt].toLowerCase()}.`} The bill reaches {fmtMoney(last.cost)} by month 12.</p>
            )}
          </div>
        )}
      </div>
      {report ? <GrowthChart report={report} /> : <div className="empty"><div className="muted">See when this design will need its next upgrade, and when it will outgrow the budget.</div></div>}
    </div>
  )
}

function GrowthChart({ report }: { report: GrowthReport }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const ms = report.months
  const W = 640
  const H = 160
  const pad = { l: 50, r: 50, t: 12, b: 24 }
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b
  const maxC = Math.max(1, report.budget ?? 0, ...ms.map((m) => m.cost)) * 1.08
  const maxP = Math.max(100, ...ms.map((m) => Math.min(m.p99, 5000)))
  const x = (i: number) => pad.l + (i / (ms.length - 1)) * iw
  const bw = iw / ms.length - 6
  const yC = (c: number) => pad.t + ih - (c / maxC) * ih
  const yP = (p: number) => pad.t + ih - (Math.min(p, 5000) / maxP) * ih
  const hov = hoverIdx !== null ? ms[hoverIdx] : null
  return (
    <div className="daychart">
      <div className="chart-head">
        <div className="legend small">
          <span><i style={{ background: 'color-mix(in srgb, var(--amber) 45%, transparent)' }} />Monthly bill</span>
          <span><i style={{ background: 'var(--ink)' }} />p99 latency</span>
          <span><i style={{ background: 'var(--red)' }} />Misses the targets</span>
          {report.budget !== null && <span><i className="dash" />Budget</span>}
        </div>
        <div className="chart-tip">
          {hov && hoverIdx !== null
            ? `${MONTHS[hoverIdx]}: ${fmtNum(hov.offered)}/s (×${hov.mult.toFixed(2)}) · ${fmtPct(hov.availability, 2)} ok · p99 ${fmtMs(hov.p99)} · ${fmtMoney(hov.cost)}/mo`
            : 'Hover a month bar for details'}
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Cost and latency over the next 12 months" onMouseLeave={() => setHoverIdx(null)}>
        {[0, 0.5, 1].map((g) => <line key={g} className="gridl" x1={pad.l} x2={W - pad.r} y1={pad.t + ih * g} y2={pad.t + ih * g} />)}
        {ms.map((m, i) => (
          <g key={m.month} onMouseEnter={() => setHoverIdx(i)}>
            <rect x={x(i) - bw / 2} y={pad.t} width={bw} height={ih} fill="transparent" />
            <rect x={x(i) - bw / 2} y={yC(m.cost)} width={bw} height={pad.t + ih - yC(m.cost)} rx="2" className={`gbar ${m.broken ? 'err' : ''} ${m.overBudget ? 'over' : ''}`}>
              <title>{`${MONTHS[i]}: ${fmtNum(m.offered)} req/s (×${m.mult.toFixed(2)}), ${fmtPct(m.availability, 2)} succeed, p99 ${fmtMs(m.p99)}, ${fmtMoney(m.cost)}/mo`}</title>
            </rect>
            <text x={x(i)} y={H - 6} fontSize="10.5" textAnchor="middle">{i === 0 ? 'Now' : i}</text>
          </g>
        ))}
        {report.budget !== null && <line className="budget" x1={pad.l - 6} x2={W - pad.r + 6} y1={yC(report.budget)} y2={yC(report.budget)} />}
        <polyline className="p99" points={ms.map((m, i) => `${x(i)},${yP(m.p99)}`).join(' ')} fill="none" strokeWidth="2" strokeLinejoin="round" style={{ pointerEvents: 'none' }} />
        {ms.map((m, i) => m.broken && <circle key={i} cx={x(i)} cy={yP(m.p99)} r="3.5" style={{ fill: 'var(--red)', pointerEvents: 'none' }} />)}
        <text x={4} y={pad.t + 9} fontSize="10.5">{fmtMoney(maxC)}</text>
        <text x={4} y={pad.t + ih} fontSize="10.5">$0</text>
        <text x={W - 4} y={pad.t + 9} fontSize="10.5" textAnchor="end">{fmtMs(maxP)}</text>
      </svg>
    </div>
  )
}

// ---------------------------------------------------------------- compare variants
export function ComparePanel() {
  const variants = useApp((s) => s.variants)
  const nodes = useApp((s) => s.nodes)
  const edges = useApp((s) => s.edges)
  const title = useApp((s) => s.title)
  const saveVariant = useApp((s) => s.saveVariant)
  const loadVariant = useApp((s) => s.loadVariant)
  const deleteVariant = useApp((s) => s.deleteVariant)
  const [name, setName] = useState('')
  const sig = useMemo(
    () => `${nodes.map((n) => `${n.id}:${n.data.label}:${JSON.stringify(n.data.config)}`).join('|')}#${edges.map((e) => `${e.id}:${e.source}->${e.target}:${JSON.stringify(e.data)}`).join('|')}`,
    [nodes, edges],
  )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const now = useMemo(() => (nodes.length ? measure(nodes, edges) : null), [sig])
  const rows = [
    ...(now ? [{ id: 'now', name: `${title} (on the board)`, m: now, current: true }] : []),
    ...variants.map((v) => ({ id: v.id, name: v.name, m: v.metrics, current: false })),
  ]
  const best = {
    p99: Math.min(...rows.map((r) => r.m.p99)),
    cost: Math.min(...rows.map((r) => r.m.cost)),
    availability: Math.max(...rows.map((r) => r.m.availability)),
  }
  const fmtCostDelta = (c: number) => {
    if (!now || Math.abs(c - now.cost) < 1) return null
    const d = c - now.cost
    return <span className={`delta ${d < 0 ? 'good' : 'bad'}`}>{d < 0 ? '−' : '+'}{fmtMoney(Math.abs(d))}</span>
  }
  const fmtLatDelta = (p: number) => {
    if (!now || Math.abs(p - now.p99) < 1) return null
    const d = p - now.p99
    return <span className={`delta ${d < 0 ? 'good' : 'bad'}`}>{d < 0 ? '−' : '+'}{fmtMs(Math.abs(d))}</span>
  }
  return (
    <div className="compare">
      <form
        className="compare-save"
        onSubmit={(e) => {
          e.preventDefault()
          saveVariant(name || title)
          setName('')
        }}
      >
        <input className="search" value={name} onChange={(e) => setName(e.target.value)} placeholder={`Name this version, e.g. “${title} with cache”`} aria-label="Variant name" />
        <button className="btn btn-accent" type="submit" disabled={!nodes.length}>Save this version</button>
      </form>
      <p className="muted small">Every version is measured the same way: at the daily peak, after autoscaling settles. Best value in each column is marked.</p>
      {rows.length > 1 ? (
        <table className="tbl compare-tbl">
          <thead><tr><th>Version</th><th>Req/s</th><th>Avg</th><th>p99</th><th>Succeed</th><th>Cost / month</th><th>Busiest part</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.current ? 'current' : ''}>
                <td className="ellip" title={r.name}><b>{r.name}</b></td>
                <td>{fmtNum(r.m.rps)}/s</td>
                <td>{fmtMs(r.m.avgLatency)}</td>
                <td className={r.m.p99 === best.p99 ? 'best' : ''}>{fmtMs(r.m.p99)}{!r.current && fmtLatDelta(r.m.p99)}</td>
                <td className={r.m.availability === best.availability ? 'best' : r.m.availability < 0.999 ? 'bad' : ''}>{fmtPct(r.m.availability, 2)}</td>
                <td className={r.m.cost === best.cost ? 'best' : ''}>{fmtMoney(r.m.cost)}{!r.current && fmtCostDelta(r.m.cost)}</td>
                <td className="ellip">{r.m.bottleneck}</td>
                <td>
                  {!r.current && (
                    <div className="row-actions">
                      <button className="btn small" onClick={() => loadVariant(r.id)}>Open</button>
                      <button className="iconbtn" onClick={() => deleteVariant(r.id)} aria-label={`Delete ${r.name}`}>✕</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty"><div className="muted">Save the design you have now, change something (add a cache, move a region, switch to NoSQL), save again, and compare them here.</div></div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- back-of-envelope estimator
export function EstimatePanel() {
  const addNode = useApp((s) => s.addNode)
  const updateConfig = useApp((s) => s.updateConfig)
  const rename = useApp((s) => s.rename)
  const showToast = useApp((s) => s.showToast)
  const [v, setV] = useState({ dau: 10_000_000, perDay: 20, peak: 2, read: 90, respKB: 10, writeKB: 2, years: 5, copies: 3 })
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: Math.max(0, Number(e.target.value) || 0) })
  const perDay = v.dau * v.perDay
  const avg = perDay / 86400
  const peak = avg * Math.max(1, v.peak)
  const reads = peak * (v.read / 100)
  const writes = peak * (1 - v.read / 100)
  const outMBs = (reads * v.respKB) / 1024
  const egressTB = (avg * (v.read / 100) * v.respKB * 2_628_000) / 1e9
  const storeDayGB = (perDay * (1 - v.read / 100) * v.writeKB) / 1e6
  const storeTotalTB = (storeDayGB * 365 * v.years * Math.max(1, v.copies)) / 1000
  const servers = Math.ceil(peak / (800 * 0.6))
  const shards = Math.max(1, Math.ceil(writes / (3200 * 0.6)))
  const addUsers = () => {
    const id = addNode('client')
    updateConfig(id, { users: Math.max(1, Math.round(v.dau)), reqPerUserMin: Math.max(0.1, Math.round(((peak * 60) / Math.max(1, v.dau)) * 100) / 100), readRatio: v.read / 100, payloadKB: v.respKB, pattern: 'daily' })
    rename(id, 'Users (estimated)')
    showToast('Added your estimated users to the board')
  }
  const field = (k: keyof typeof v, label: string, unit?: string, step = 1) => (
    <label className="est-field" key={k}>
      <span>{label}</span>
      <span className="numfield">
        <input type="number" min={0} step={step} value={v[k]} onChange={set(k)} />
        {unit && <span className="unit">{unit}</span>}
      </span>
    </label>
  )
  return (
    <div className="estimate">
      <div className="est-inputs">
        {field('dau', 'Daily active users', undefined, 100000)}
        {field('perDay', 'Requests per user per day')}
        {field('peak', 'Peak is how many × the average', undefined, 0.5)}
        {field('read', 'Share that are reads', '%')}
        {field('respKB', 'Average response size', 'KB')}
        {field('writeKB', 'Data stored per write', 'KB')}
        {field('years', 'Keep data for', 'years')}
        {field('copies', 'Copies of each byte')}
      </div>
      <div className="est-out">
        <div className="est-grid">
          <div><span>Average load</span><b>{fmtNum(avg)} req/s</b></div>
          <div><span>Peak load</span><b>{fmtNum(peak)} req/s</b></div>
          <div><span>Reads at peak</span><b>{fmtNum(reads)}/s</b></div>
          <div><span>Writes at peak</span><b>{fmtNum(writes)}/s</b></div>
          <div><span>Bandwidth out at peak</span><b>{outMBs >= 1024 ? `${(outMBs / 1024).toFixed(1)} GB/s` : `${fmtNum(outMBs)} MB/s`}</b></div>
          <div><span>Data sent per month</span><b>{egressTB >= 1000 ? `${(egressTB / 1000).toFixed(1)} PB` : `${fmtNum(egressTB)} TB`}</b></div>
          <div><span>New data per day</span><b>{storeDayGB >= 1000 ? `${(storeDayGB / 1000).toFixed(1)} TB` : `${fmtNum(storeDayGB)} GB`}</b></div>
          <div><span>Storage after {v.years} years</span><b>{storeTotalTB >= 1000 ? `${(storeTotalTB / 1000).toFixed(1)} PB` : `${fmtNum(storeTotalTB)} TB`}</b></div>
        </div>
        <p className="small est-sizing">
          Rough sizing: about <b>{servers.toLocaleString()} medium app server{servers === 1 ? '' : 's'}</b> at peak (at 60 % busy), and writes need <b>{shards} SQL shard{shards > 1 ? 's' : ''}</b> (large instances){reads > writes * 20 ? ', and with reads this dominant, a cache will carry most of the load' : ''}.
        </p>
        <div className="btnrow">
          <button className="btn btn-accent" onClick={addUsers}>Add these users to the board</button>
          <span className="muted small">Creates a Users node whose daily peak matches {fmtNum(peak)} req/s.</span>
        </div>
      </div>
    </div>
  )
}
