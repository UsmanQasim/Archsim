import { useEffect, useState } from 'react'
import { allChallenges, findChallenge } from '../sim/scenarios'
import { PHASES, fmtTimer, phaseWindows } from '../practice'
import { fmtMoney, fmtMs, fmtPct } from '../format'
import { useApp, useSim } from '../store'
import { downloadDesignDoc } from '../doc'

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [active])
  return now
}

/** Remaining time pill for the top bar while a session runs. */
export function PracticeTimer() {
  const iv = useApp((s) => s.interview)
  const setTab = useApp((s) => s.setDockTab)
  const now = useNow(!!iv && !iv.finishedAt)
  if (!iv || iv.finishedAt) return null
  const elapsed = (now - iv.startedAt) / 1000
  const left = iv.minutes * 60 - elapsed
  const win = phaseWindows(iv.minutes).find((w) => elapsed < w.end) ?? null
  const phase = PHASES.find((p) => p.id === win?.id)
  return (
    <button className={`timer-pill ${left < 0 ? 'over' : left < 300 ? 'late' : ''}`} onClick={() => setTab('practice')} title={`Practice session${phase ? `, now: ${phase.title}` : ''}. Open the notes.`}>
      <span className="timer-dot" aria-hidden />
      {left >= 0 ? fmtTimer(left) : `+${fmtTimer(-left)}`}
      <span className="timer-phase">{phase ? phase.title : 'Time is up'}</span>
    </button>
  )
}

export function PracticePanel() {
  const iv = useApp((s) => s.interview)
  if (!iv) return <PracticeStart />
  if (iv.finishedAt) return <PracticeSummary />
  return <PracticeLive />
}

function PracticeStart() {
  const challengeId = useApp((s) => s.challengeId)
  const startChallenge = useApp((s) => s.startChallenge)
  const startInterview = useApp((s) => s.startInterview)
  const nodes = useApp((s) => s.nodes)
  const [q, setQ] = useState<string>(challengeId ?? allChallenges()[0].id)
  const [minutes, setMinutes] = useState(45)
  const ch = findChallenge(q)
  const start = () => {
    if (q !== 'board' && q !== challengeId) startChallenge(q)
    startInterview(minutes)
  }
  return (
    <div className="practice-start">
      <div>
        <p>Run a mock interview against the clock. You get the usual five stages with a time budget for each and a place to write your thinking as you go. Your notes go into the design doc at the end.</p>
        <div className="practice-form">
          <label className="field">
            <span>Question</span>
            <select value={q} onChange={(e) => setQ(e.target.value)}>
              <option value="board">Whatever is on the board{nodes.length ? '' : ' (empty)'}</option>
              {allChallenges().map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Length</span>
            <div className="seg">
              {[35, 45, 60].map((m) => <button key={m} className={minutes === m ? 'on' : ''} onClick={() => setMinutes(m)}>{m} min</button>)}
            </div>
          </label>
        </div>
        {ch && q !== challengeId && <p className="small muted">Starting clears the board and loads the {ch.title} brief.</p>}
        <button className="btn btn-accent" onClick={start}>Start the clock</button>
      </div>
      <ol className="phase-plan">
        {phaseWindows(minutes).map((w, i) => (
          <li key={w.id}>
            <b>{PHASES[i].title}</b>
            <span className="muted small">{Math.round((w.end - w.start) / 60)} min</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function PracticeLive() {
  const iv = useApp((s) => s.interview)!
  const setNote = useApp((s) => s.setInterviewNote)
  const finish = useApp((s) => s.finishInterview)
  const clear = useApp((s) => s.clearInterview)
  const setTab = useApp((s) => s.setDockTab)
  const now = useNow(true)
  const elapsed = (now - iv.startedAt) / 1000
  const wins = phaseWindows(iv.minutes)
  const currentIdx = Math.max(0, wins.findIndex((w) => elapsed < w.end))
  const current = elapsed >= iv.minutes * 60 ? wins.length - 1 : currentIdx
  const [picked, setPicked] = useState<string | null>(null)
  const shownId = picked ?? wins[current].id
  const shown = PHASES.find((p) => p.id === shownId)!
  const left = iv.minutes * 60 - elapsed
  const ch = findChallenge(iv.challengeId)
  const goto: Record<string, (() => void) | undefined> = {
    estimates: () => setTab('estimate'),
    bottlenecks: () => setTab('tests'),
  }
  return (
    <div className="practice-live">
      <div className="practice-side">
        <div className={`practice-clock ${left < 0 ? 'over' : left < 300 ? 'late' : ''}`}>
          <b>{left >= 0 ? fmtTimer(left) : `+${fmtTimer(-left)}`}</b>
          <span className="small muted">{left >= 0 ? 'left' : 'over time'}{ch ? `, ${ch.title}` : ''}</span>
        </div>
        <ol className="phase-list">
          {wins.map((w, i) => {
            const p = PHASES[i]
            const st = i < current ? 'done' : i === current ? 'now' : 'next'
            const frac = Math.max(0, Math.min(1, (elapsed - w.start) / (w.end - w.start)))
            return (
              <li key={w.id}>
                <button className={`phase ${st} ${shownId === w.id ? 'on' : ''}`} onClick={() => setPicked(w.id === wins[current].id ? null : w.id)}>
                  <span className="phase-name">{p.title}</span>
                  <span className="small muted">{iv.notes[p.id]?.trim() ? 'notes' : ''} {fmtTimer(w.start)}</span>
                  <span className="phase-bar" style={{ ['--f' as string]: `${frac * 100}%` }} aria-hidden />
                </button>
              </li>
            )
          })}
        </ol>
      </div>
      <div className="practice-notes">
        <div className="practice-notes-head">
          <b>{shown.title}</b>
          <div className="practice-actions">
            {goto[shown.id] && <button className="linkbtn small" onClick={goto[shown.id]}>{shown.id === 'estimates' ? 'Open the Estimate tab' : 'Open the stress tests'}</button>}
            <button className="linkbtn small" onClick={clear} title="Stop without a summary. Your notes are discarded.">Abandon</button>
            <button className="btn btn-accent small" onClick={finish}>Finish</button>
          </div>
        </div>
        <ul className="prompts small">
          {shown.prompts.map((t) => <li key={t}>{t}</li>)}
        </ul>
        <textarea
          className="practice-text"
          value={iv.notes[shown.id] ?? ''}
          onChange={(e) => setNote(shown.id, e.target.value)}
          placeholder="Write what you would say out loud here."
          aria-label={`Notes for ${shown.title}`}
        />
      </div>
    </div>
  )
}

function PracticeSummary() {
  const iv = useApp((s) => s.interview)!
  const clear = useApp((s) => s.clearInterview)
  const runDayTest = useApp((s) => s.runDayTest)
  const report = useApp((s) => s.dayReport)
  const nodes = useApp((s) => s.nodes)
  const res = useSim((s) => s.result)
  const taken = ((iv.finishedAt ?? Date.now()) - iv.startedAt) / 1000
  const ch = findChallenge(iv.challengeId)
  const covered = PHASES.filter((p) => iv.notes[p.id]?.trim())
  const T = res?.totals
  const checks: { label: string; ok: boolean }[] = []
  checks.push({ label: `Finished in time (${fmtTimer(taken)} of ${iv.minutes}:00)`, ok: taken <= iv.minutes * 60 })
  checks.push({ label: `Wrote notes for ${covered.length} of ${PHASES.length} stages`, ok: covered.length === PHASES.length })
  checks.push({ label: `${nodes.filter((n) => n.data.kind !== 'client').length} components on the board`, ok: nodes.length > 2 })
  if (ch && T && T.success <= 0) {
    checks.push({ label: 'Nothing on the board serves requests yet', ok: false })
  } else if (ch && T) {
    checks.push({ label: `p99 ${fmtMs(T.p99)}, target under ${ch.targets.p99} ms`, ok: T.p99 <= ch.targets.p99 })
    checks.push({ label: `${fmtPct(T.availability, 2)} succeed, target ${fmtPct(ch.targets.availability, 2)}`, ok: T.availability >= ch.targets.availability })
    checks.push({ label: `${fmtMoney(T.monthlyCost)} a month, budget ${fmtMoney(ch.targets.budget)}`, ok: T.monthlyCost <= ch.targets.budget })
  }
  const missing = PHASES.filter((p) => !iv.notes[p.id]?.trim())
  return (
    <div className="practice-summary">
      <div>
        <p><b>Session done{ch ? `: ${ch.title}` : ''}.</b></p>
        <ul className="sum-checks">
          {checks.map((c) => <li key={c.label} className={c.ok ? 'ok' : 'miss'}><span aria-hidden>{c.ok ? '✓' : '○'}</span>{c.label}</li>)}
        </ul>
        {missing.length > 0 && <p className="small muted">You skipped {missing.map((p) => p.title.toLowerCase()).join(', ')}. Interviewers usually ask about all five.</p>}
        <div className="btnrow">
          {ch && <button className="btn small" onClick={runDayTest}>{report ? 'Run the 24-hour test again' : 'Run the 24-hour test'}</button>}
          <button className="btn small" onClick={downloadDesignDoc}>Download design doc with notes</button>
          <button className="btn btn-accent small" onClick={clear}>New session</button>
        </div>
      </div>
      <div className="summary-notes">
        {covered.length ? covered.map((p) => (
          <div key={p.id}>
            <b className="small">{p.title}</b>
            <p className="small">{iv.notes[p.id]}</p>
          </div>
        )) : <div className="muted small">No notes this time.</div>}
      </div>
    </div>
  )
}
