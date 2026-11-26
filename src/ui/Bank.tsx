import { useEffect, useMemo, useRef, useState } from 'react'
import { CATALOG, KIND_ORDER } from '../sim/catalog'
import { runDay } from '../sim/engine'
import { allChallenges, customChallenges, TOPICS, type Challenge, type Graph } from '../sim/scenarios'
import { compileSpec, describeCheck, parseSpec, specFromSnapshots, type ChallengeSpec, type CheckSpec, type Difficulty } from '../sim/spec'
import { emptyChaos, type GraphEdge, type GraphNode, type NodeConfig, type NodeKind } from '../sim/types'
import { LESSONS } from '../learn'
import { buildResult, challengeLink, copyText, resultLink, type ResultPayload } from '../share'
import { fmtMoney, fmtMs, fmtPct } from '../format'
import { useApp, useSim } from '../store'

// ------------------------------------------------------------------ shared bits
function Dialog({ open, onClose, label, wide, children }: { open: boolean; onClose: () => void; label: string; wide?: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} className={`bank-dlg ${wide ? 'wide' : ''}`} aria-label={label} onClose={onClose} onCancel={onClose}>
      {open && children}
      {open && <DialogToast />}
    </dialog>
  )
}

/** the app toast sits under the modal's top layer, so modals show their own copy */
function DialogToast() {
  const toast = useApp((s) => s.toast)
  return toast ? <div className="bank-toast" role="status">{toast}</div> : null
}

const DIFFS: Difficulty[] = ['Easy', 'Medium', 'Hard']
const loadSet = (key: string) => {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(key) ?? '[]'))
  } catch {
    return new Set<string>()
  }
}

// ------------------------------------------------------------------ problem bank
export function ProblemBank() {
  const bank = useApp((s) => s.bank)
  const close = useApp((s) => s.closeBank)
  const open = useApp((s) => s.openBank)
  return (
    <Dialog open={bank.open} onClose={close} label="Problems and lessons" wide>
      <div className="bank">
        <header className="bank-head">
          <div className="seg bank-tabs" role="tablist" aria-label="Sections">
            {([['problems', 'Problems'], ['learn', 'Learn'], ['create', 'Create a challenge']] as const).map(([id, l]) => (
              <button key={id} role="tab" aria-selected={bank.tab === id} className={bank.tab === id ? 'on' : ''} onClick={() => open(id)}>{l}</button>
            ))}
          </div>
          <button className="iconbtn" onClick={close} aria-label="Close">✕</button>
        </header>
        <div className="bank-body">
          {bank.tab === 'problems' && <ProblemList />}
          {bank.tab === 'learn' && <LessonList />}
          {bank.tab === 'create' && <ChallengeEditor />}
        </div>
      </div>
    </Dialog>
  )
}

function ProblemList() {
  useApp((s) => s.customVersion)
  const passed = useApp((s) => s.passed)
  const startChallenge = useApp((s) => s.startChallenge)
  const startGuide = useApp((s) => s.startGuide)
  const close = useApp((s) => s.closeBank)
  const open = useApp((s) => s.openBank)
  const remove = useApp((s) => s.removeCustomChallenge)
  const showToast = useApp((s) => s.showToast)
  const [q, setQ] = useState('')
  const [diff, setDiff] = useState<'All' | Difficulty>('All')
  const [topic, setTopic] = useState('All')
  const [status, setStatus] = useState<'all' | 'todo' | 'done'>('all')
  const all = allChallenges()
  const custom = new Set(customChallenges().map((c) => c.id))
  const topics = useMemo(() => [...new Set([...TOPICS, ...all.map((c) => c.topic)])].sort(), [all])
  const query = q.trim().toLowerCase()
  const list = all.filter((c) =>
    (diff === 'All' || c.difficulty === diff) &&
    (topic === 'All' || c.topic === topic) &&
    (status === 'all' || (status === 'done') === !!passed[c.id]) &&
    (!query || `${c.title} ${c.topic} ${(c.tags ?? []).join(' ')} ${c.concepts.join(' ')}`.toLowerCase().includes(query)),
  )
  const count = (d: Difficulty) => all.filter((c) => c.difficulty === d)
  const go = (fn: () => void) => { fn(); close() }
  return (
    <div className="plist">
      <div className="plist-stats">
        {DIFFS.map((d) => (
          <div key={d} className={`pstat d-${d}`}>
            <b>{count(d).filter((c) => passed[c.id]).length}<span>/{count(d).length}</span></b>
            <span>{d}</span>
          </div>
        ))}
        <div className="pstat">
          <b>{all.filter((c) => passed[c.id]).length}<span>/{all.length}</span></b>
          <span>Solved</span>
        </div>
      </div>
      <div className="plist-filters">
        <input className="search" placeholder="Search problems, topics or ideas, e.g. queue, Uber, sharding" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search problems" />
        <div className="seg" role="group" aria-label="Difficulty">
          {(['All', ...DIFFS] as const).map((d) => <button key={d} className={diff === d ? 'on' : ''} onClick={() => setDiff(d)}>{d}</button>)}
        </div>
        <select value={topic} onChange={(e) => setTopic(e.target.value)} aria-label="Topic">
          <option value="All">All topics</option>
          {topics.map((t) => <option key={t}>{t}</option>)}
        </select>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status">
          <option value="all">Any status</option>
          <option value="todo">Not solved</option>
          <option value="done">Solved</option>
        </select>
      </div>
      <table className="ptable">
        <thead>
          <tr><th aria-label="Solved"></th><th>Problem</th><th>Topic</th><th>Difficulty</th><th></th></tr>
        </thead>
        <tbody>
          {list.map((c) => (
            <tr key={c.id}>
              <td className="pdone">{passed[c.id] ? <span title="Solved" aria-label="Solved">✓</span> : null}</td>
              <td>
                <button className="ptitle" onClick={() => go(() => startChallenge(c.id))}>{c.title}</button>
                <div className="ptags small">
                  {custom.has(c.id) && <span className="ptag own">{c.author && c.author !== 'You' ? `by ${c.author}` : 'yours'}</span>}
                  {(c.tags ?? c.concepts.slice(0, 3)).slice(0, 4).map((t) => <span key={t} className="ptag">{t}</span>)}
                </div>
              </td>
              <td className="small muted">{c.topic}</td>
              <td><span className={`diff d-${c.difficulty}`}>{c.difficulty}</span></td>
              <td className="pacts">
                <button className="btn small btn-accent" onClick={() => go(() => startChallenge(c.id))}>Solve</button>
                <button className="btn small" onClick={() => go(() => startGuide(c.id))}>Solution</button>
                {custom.has(c.id) && (
                  <>
                    <button className="linkbtn small" onClick={async () => showToast((await copyText(challengeLink(c.spec!))) ? 'Challenge link copied' : 'Could not copy the link')}>Copy link</button>
                    <button className="linkbtn small" onClick={() => { localStorage.setItem('archsim:draft', JSON.stringify(c.spec)); open('create') }}>Edit</button>
                    <button className="linkbtn small danger" onClick={() => remove(c.id)}>Delete</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!list.length && <p className="muted">No problems match. Clear a filter or try another word.</p>}
    </div>
  )
}

// ------------------------------------------------------------------ learn
function LessonList() {
  const start = useApp((s) => s.startLesson)
  const done = loadSet('archsim:lessons')
  return (
    <div className="lessons">
      <p className="muted">Short lessons on one idea each. Every lesson gives you a broken system and a task, and checks your fix live.</p>
      <ol className="lesson-grid">
        {LESSONS.map((l, i) => (
          <li key={l.id} className={done.has(l.id) ? 'done' : ''}>
            <span className="lesson-n">{i + 1}</span>
            <div>
              <b>{l.title}</b>
              <p className="small">{l.summary}</p>
              <span className="small muted">{l.concept}, about {l.minutes} min{done.has(l.id) ? ', done' : ''}</span>
            </div>
            <button className="btn small" onClick={() => start(l.id)}>{done.has(l.id) ? 'Again' : 'Start'}</button>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** Dock panel for the lesson in progress. */
export function LessonPanel() {
  const cur = useApp((s) => s.lesson)
  const lessonTo = useApp((s) => s.lessonTo)
  const exit = useApp((s) => s.exitLesson)
  const startLesson = useApp((s) => s.startLesson)
  const openBank = useApp((s) => s.openBank)
  const nodes = useApp((s) => s.nodes)
  const edges = useApp((s) => s.edges)
  const chaos = useApp((s) => s.chaos)
  const result = useSim((s) => s.result)
  const lesson = cur && LESSONS.find((l) => l.id === cur.id)
  if (!cur || !lesson) {
    return (
      <div className="empty">
        <div className="muted">Pick a lesson to learn one idea at a time on a live board.</div>
        <button className="btn btn-accent" onClick={() => openBank('learn')}>Browse lessons</button>
      </div>
    )
  }
  const step = lesson.steps[cur.step]
  const done = !!(step.task && result && step.task.done({ nodes, edges, result, chaos }))
  const last = cur.step === lesson.steps.length - 1
  const idx = LESSONS.indexOf(lesson)
  const finish = () => {
    const s = loadSet('archsim:lessons')
    s.add(lesson.id)
    localStorage.setItem('archsim:lessons', JSON.stringify([...s]))
  }
  return (
    <div className="lesson">
      <div className="lesson-side">
        <span className="small muted">Lesson {idx + 1} of {LESSONS.length}</span>
        <b className="lesson-title">{lesson.title}</b>
        <ol className="lesson-steps">
          {lesson.steps.map((s, i) => (
            <li key={s.title} className={i === cur.step ? 'on' : i < cur.step ? 'past' : ''}>
              <button className="linkbtn" onClick={() => lessonTo(i)}>{s.title}</button>
            </li>
          ))}
        </ol>
        <button className="linkbtn small" onClick={exit}>Leave the lesson</button>
      </div>
      <div className="lesson-main">
        <h4>{step.title}</h4>
        {step.text.map((t) => <p key={t}>{t}</p>)}
        {step.task && (
          <div className={`task ${done ? 'ok' : ''}`} role="status" aria-live="polite">
            <b>{done ? 'Done.' : 'Your turn.'}</b> {done ? step.task.success : step.task.prompt}
          </div>
        )}
        <div className="btnrow">
          {cur.step > 0 && <button className="btn small" onClick={() => lessonTo(cur.step - 1)}>Back</button>}
          {!last && <button className={`btn small ${!step.task || done ? 'btn-accent' : ''}`} onClick={() => lessonTo(cur.step + 1)}>{step.task && !done ? 'Skip' : 'Next'}</button>}
          {last && idx < LESSONS.length - 1 && <button className="btn small btn-accent" onClick={() => { finish(); startLesson(LESSONS[idx + 1].id) }}>Next lesson: {LESSONS[idx + 1].title}</button>}
          {last && <button className="btn small" onClick={() => { finish(); exit(); openBank('learn') }}>Finish</button>}
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ editor
type Snap = { nodes: GraphNode[]; edges: GraphEdge[] }
interface Draft {
  title: string
  difficulty: Difficulty
  topic: string
  tags: string
  brief: string
  hints: string
  author: string
  targets: { p99: number; availability: number; budget: number; backlogSec: number }
  checks: CheckSpec[]
  start: Snap | null
  steps: { title: string; why: string; board: Snap }[]
  /** set when editing a challenge that was saved before */
  id?: string
  /** an existing spec being edited, used when no boards were captured again */
  base?: ChallengeSpec
}

const EMPTY: Draft = {
  title: '', difficulty: 'Medium', topic: 'Scaling basics', tags: '', brief: '', hints: '', author: '',
  targets: { p99: 300, availability: 0.999, budget: 50000, backlogSec: 0 }, checks: [], start: null, steps: [],
}

const CHECK_PRESETS: { name: string; make: () => CheckSpec }[] = [
  { name: 'Servers sit behind a load balancer', make: () => ({ type: 'noDirect', from: ['client'], to: ['app', 'container', 'k8s'], label: 'Servers sit behind a load balancer or gateway', why: 'Health checks route around dead instances.' }) },
  { name: 'Reads come from a cache', make: () => ({ type: 'path', from: ['client'], to: ['cache', 'cdn'], label: 'Reads come from a cache', why: 'Caches answer in about a millisecond and protect the database.' }) },
  { name: 'Database survives a zone outage', make: () => ({ type: 'resilient', kinds: ['sql'] }) },
  { name: 'Stateless tier autoscales', make: () => ({ type: 'autoscale' }) },
  { name: 'Runs in at least N regions', make: () => ({ type: 'regions', min: 2 }) },
  { name: 'Uses a component', make: () => ({ type: 'has', kinds: ['queue'] }) },
  { name: 'Does not use a component', make: () => ({ type: 'lacks', kinds: ['sql'] }) },
  { name: 'Traffic reaches A from B', make: () => ({ type: 'path', from: ['client'], to: ['cdn'] }) },
  { name: 'A hands work to B through a queue', make: () => ({ type: 'decoupled', from: ['app'], to: ['worker'] }) },
  { name: 'A never calls B directly', make: () => ({ type: 'noDirect', from: ['app'], to: ['sql'] }) },
  { name: 'A setting has a value', make: () => ({ type: 'config', kinds: ['sql'], field: 'replicas', op: '>=', value: 1 }) },
]

const snap = (): Snap => {
  const s = useApp.getState()
  return { nodes: structuredClone(s.nodes), edges: structuredClone(s.edges) }
}

function draftFromSpec(spec: ChallengeSpec): Draft {
  return {
    title: spec.title, difficulty: spec.difficulty, topic: spec.topic, tags: (spec.tags ?? []).join(', '), brief: spec.brief,
    hints: (spec.hints ?? []).join('\n'), author: spec.author ?? '',
    targets: { ...spec.targets, backlogSec: spec.targets.backlogSec ?? 0 },
    checks: spec.checks, start: null, steps: [], id: spec.id, base: spec,
  }
}

function specFromDraft(d: Draft): ChallengeSpec {
  const shape = d.steps.length
    ? specFromSnapshots(d.start ?? { nodes: d.steps[0].board.nodes.filter((n) => n.data.kind === 'client'), edges: [] }, d.steps.map((s) => s.board))
    : { nodes: d.base?.nodes ?? [], edges: d.base?.edges ?? [] }
  const t = { p99: d.targets.p99, availability: d.targets.availability, budget: d.targets.budget, ...(d.targets.backlogSec > 0 ? { backlogSec: d.targets.backlogSec } : {}) }
  return {
    v: 1,
    id: d.id ?? `custom-${Date.now().toString(36)}`,
    title: d.title.trim() || 'Untitled challenge',
    difficulty: d.difficulty,
    topic: d.topic.trim() || 'Custom',
    tags: d.tags.split(',').map((t) => t.trim()).filter(Boolean),
    brief: d.brief.trim(),
    hints: d.hints.split('\n').map((h) => h.trim()).filter(Boolean),
    author: d.author.trim() || undefined,
    targets: t,
    checks: d.checks,
    steps: d.steps.length ? d.steps.map((s) => ({ title: s.title || 'Reference design', why: s.why })) : d.base?.steps ?? [],
    ...shape,
  }
}

function KindPick({ value, onChange, label }: { value: NodeKind[]; onChange: (k: NodeKind[]) => void; label: string }) {
  return (
    <select aria-label={label} value={value[0]} onChange={(e) => onChange([e.target.value as NodeKind])}>
      {KIND_ORDER.map((k) => <option key={k} value={k}>{CATALOG[k].label}</option>)}
    </select>
  )
}

const CHECK_TYPES: Record<CheckSpec['type'], string> = {
  has: 'Uses', lacks: 'Does not use', path: 'Traffic reaches', decoupled: 'Through a queue', noDirect: 'Never calls directly',
  resilient: 'Survives a zone outage', autoscale: 'Autoscales', regions: 'Regions at least', config: 'Setting',
}

function CheckRow({ c, onChange, onRemove }: { c: CheckSpec; onChange: (c: CheckSpec) => void; onRemove: () => void }) {
  const d = describeCheck(c)
  return (
    <li className="ed-check">
      <div className="ed-check-params">
        <span className="small muted ed-check-type">{CHECK_TYPES[c.type]}</span>
        {'from' in c && <KindPick label="From" value={c.from} onChange={(from) => onChange({ ...c, from } as CheckSpec)} />}
        {'from' in c && <span className="muted small">to</span>}
        {'to' in c && <KindPick label="To" value={c.to} onChange={(to) => onChange({ ...c, to } as CheckSpec)} />}
        {'kinds' in c && <KindPick label="Component" value={c.kinds} onChange={(kinds) => onChange({ ...c, kinds } as CheckSpec)} />}
        {c.type === 'regions' && <input type="number" min={1} max={6} aria-label="Regions" value={c.min} onChange={(e) => onChange({ ...c, min: Number(e.target.value) || 1 })} />}
        {c.type === 'config' && (
          <>
            <select aria-label="Setting" value={String(c.field)} onChange={(e) => onChange({ ...c, field: e.target.value as keyof NodeConfig })}>
              {['instances', 'minInstances', 'replicas', 'shards', 'multiAz', 'hitRate', 'consistency', 'region', 'pricing', 'arch'].map((f) => <option key={f}>{f}</option>)}
            </select>
            <select aria-label="Comparison" value={c.op} onChange={(e) => onChange({ ...c, op: e.target.value as '>=' })}>
              {['>=', '<=', '=='].map((o) => <option key={o}>{o}</option>)}
            </select>
            <input aria-label="Value" value={String(c.value)} onChange={(e) => {
              const raw = e.target.value
              const v = raw === 'true' ? true : raw === 'false' ? false : Number.isFinite(Number(raw)) && raw !== '' ? Number(raw) : raw
              onChange({ ...c, value: v })
            }} />
          </>
        )}
        <button className="linkbtn small danger" onClick={onRemove}>Remove</button>
      </div>
      <input className="ed-check-label" aria-label="What the candidate sees" placeholder={d.label} value={c.label ?? ''} onChange={(e) => onChange({ ...c, label: e.target.value || undefined })} />
      <input className="ed-check-why small" aria-label="Why it matters" placeholder={d.why} value={c.why ?? ''} onChange={(e) => onChange({ ...c, why: e.target.value || undefined })} />
    </li>
  )
}

function ChallengeEditor() {
  const add = useApp((s) => s.addCustomChallenge)
  const showToast = useApp((s) => s.showToast)
  const close = useApp((s) => s.closeBank)
  const loadGraph = useApp((s) => s.loadGraph)
  const [d, setD] = useState<Draft>(() => {
    try {
      const raw = localStorage.getItem('archsim:draft')
      if (raw) {
        const o = JSON.parse(raw)
        return o.v === 1 ? draftFromSpec(parseSpec(o)) : { ...EMPTY, ...o }
      }
    } catch {
      /* start fresh */
    }
    return EMPTY
  })
  const [test, setTest] = useState<null | { ok: boolean; lines: { label: string; ok: boolean; detail: string }[] }>(null)
  const [stepTitle, setStepTitle] = useState('')
  const [stepWhy, setStepWhy] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const t = setTimeout(() => localStorage.setItem('archsim:draft', JSON.stringify(d)), 300)
    return () => clearTimeout(t)
  }, [d])
  const set = (p: Partial<Draft>) => { setD((x) => ({ ...x, ...p })); setTest(null) }
  const setT = (p: Partial<Draft['targets']>) => set({ targets: { ...d.targets, ...p } })
  const usersOnBoard = useApp((s) => s.nodes.filter((n) => n.data.kind === 'client').length)
  const boardSize = useApp((s) => s.nodes.length)

  const run = () => {
    const spec = specFromDraft(d)
    const ch = compileSpec(spec)
    const last = ch.build(ch.steps.length - 1)
    const day = runDay(last.nodes, last.edges, emptyChaos(), 120)
    const t = spec.targets
    const lines = [
      { label: 'p99 latency', ok: day.dayAvailability > 0 && day.dayP99 <= t.p99, detail: `${fmtMs(day.dayP99)} against ≤ ${t.p99} ms` },
      { label: 'Availability', ok: day.dayAvailability >= t.availability, detail: `${fmtPct(day.dayAvailability, 2)} against ≥ ${fmtPct(t.availability, 2)}` },
      { label: 'Monthly cost', ok: day.avgMonthlyCost <= t.budget, detail: `${fmtMoney(day.avgMonthlyCost)} against ≤ ${fmtMoney(t.budget)}` },
      ...(t.backlogSec ? [{ label: 'Queue delay', ok: day.maxBacklogSec <= t.backlogSec, detail: `${Math.round(day.maxBacklogSec)} s against ≤ ${t.backlogSec} s` }] : []),
      ...ch.checks.map((c) => ({ label: c.label, ok: c.test(last), detail: 'design check' })),
    ]
    const start = ch.build(-1)
    const sd = runDay(start.nodes, start.edges, emptyChaos(), 300)
    const startPasses = sd.dayAvailability >= t.availability && sd.dayP99 <= t.p99 && sd.avgMonthlyCost <= t.budget && ch.checks.every((c) => c.test(start))
    lines.push({ label: 'The starting board does not already pass', ok: !startPasses, detail: startPasses ? 'make the targets or checks stricter' : 'good' })
    setTest({ ok: lines.every((l) => l.ok), lines })
    return { day, spec }
  }
  const autoTargets = () => {
    const ch = compileSpec(specFromDraft(d))
    const last = ch.build(ch.steps.length - 1)
    const day = runDay(last.nodes, last.edges, emptyChaos(), 120)
    const nice = (x: number) => { if (x <= 0) return 0; const p = Math.pow(10, Math.floor(Math.log10(x)) - 1); return Math.ceil(x / p) * p }
    setT({
      p99: nice(Math.max(day.dayP99 * 1.3, day.dayP99 + 40)),
      availability: day.dayAvailability >= 0.9995 ? 0.999 : day.dayAvailability >= 0.996 ? 0.995 : 0.99,
      budget: nice(day.avgMonthlyCost * 1.2),
      backlogSec: day.maxBacklogSec > 1 ? nice(Math.max(day.maxBacklogSec * 1.5, 120)) : 0,
    })
  }
  const save = (thenCopy: boolean) => {
    const spec = specFromDraft(d)
    add(spec)
    setD((x) => ({ ...x, id: spec.id }))
    if (thenCopy) copyText(challengeLink(spec)).then((ok) => showToast(ok ? 'Saved. Challenge link copied: send it to your candidate.' : 'Saved. Copy the link from Problems.'))
    else showToast('Saved to your problems')
  }
  const hasShape = d.steps.length > 0 || (d.base?.nodes.length ?? 0) > 0
  return (
    <div className="editor">
      <section className="ed-intro">
        <p>Build the reference answer on the board, capture it here as one or more steps, then set targets and checks. Candidates get a link that opens the brief with only the users on the board, and send you back a result link.</p>
        <div className="btnrow">
          <button className="btn small" onClick={() => { localStorage.removeItem('archsim:draft'); setD(EMPTY); setTest(null) }}>New challenge</button>
          <button className="btn small" onClick={() => fileRef.current?.click()}>Open JSON</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) f.text().then((t) => { try { setD(draftFromSpec(parseSpec(JSON.parse(t)))); showToast('Challenge opened') } catch { showToast('That file is not an ArchSim challenge') } })
            e.target.value = ''
          }} />
        </div>
      </section>

      <section className="ed-grid">
        <div className="ed-col">
          <h4>The problem</h4>
          <label className="field"><span>Title</span><input value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder="Design a URL shortener" /></label>
          <label className="field"><span>Difficulty</span>
            <select value={d.difficulty} onChange={(e) => set({ difficulty: e.target.value as Difficulty })}>{DIFFS.map((x) => <option key={x}>{x}</option>)}</select>
          </label>
          <label className="field"><span>Topic</span>
            <input list="ed-topics" value={d.topic} onChange={(e) => set({ topic: e.target.value })} />
            <datalist id="ed-topics">{TOPICS.map((t) => <option key={t} value={t} />)}</datalist>
          </label>
          <label className="field"><span>Tags</span><input value={d.tags} onChange={(e) => set({ tags: e.target.value })} placeholder="cache, read-heavy" /></label>
          <label className="field"><span>Your name</span><input value={d.author} onChange={(e) => set({ author: e.target.value })} placeholder="Shown to candidates" /></label>
          <label className="field field-top"><span>Brief</span><textarea rows={4} value={d.brief} onChange={(e) => set({ brief: e.target.value })} placeholder="Who the users are, how many, what they do, and what matters most." /></label>
          <label className="field field-top"><span>Hints</span><textarea rows={3} value={d.hints} onChange={(e) => set({ hints: e.target.value })} placeholder="One per line. Candidates reveal them one at a time." /></label>
        </div>

        <div className="ed-col">
          <h4>The reference answer</h4>
          <p className="small muted">On the board now: {boardSize} {boardSize === 1 ? 'part' : 'parts'}, {usersOnBoard} {usersOnBoard === 1 ? 'group' : 'groups'} of users.</p>
          <div className="ed-start">
            <b className="small">Starting board</b>
            <span className="small muted">{d.start ? `${d.start.nodes.length} parts captured` : 'Only the users from the first step'}</span>
            <button className="btn small" onClick={() => set({ start: snap() })} disabled={!boardSize}>Use the board</button>
            {d.start && <button className="linkbtn small" onClick={() => set({ start: null })}>Reset</button>}
          </div>
          <ol className="ed-steps">
            {d.steps.map((s, i) => (
              <li key={i}>
                <div><b>{s.title || `Step ${i + 1}`}</b><span className="small muted"> {s.board.nodes.length} parts</span></div>
                <p className="small">{s.why}</p>
                <div className="btnrow">
                  <button className="linkbtn small" onClick={() => { loadGraph(s.board as Graph, { title: `Editing: ${d.title || 'challenge'}`, keepDock: true }); close() }}>Show on board</button>
                  <button className="linkbtn small" onClick={() => set({ steps: d.steps.map((x, j) => (j === i ? { ...x, board: snap() } : x)) })}>Replace with board</button>
                  <button className="linkbtn small danger" onClick={() => set({ steps: d.steps.filter((_, j) => j !== i) })}>Remove</button>
                </div>
              </li>
            ))}
          </ol>
          {!d.steps.length && d.base && <p className="small muted">Using the {d.base.steps.length} saved solution steps. Capture new ones to replace them.</p>}
          <div className="ed-addstep">
            <input value={stepTitle} onChange={(e) => setStepTitle(e.target.value)} placeholder={`Step ${d.steps.length + 1} title, e.g. Add a cache`} aria-label="Step title" />
            <textarea rows={2} value={stepWhy} onChange={(e) => setStepWhy(e.target.value)} placeholder="Why this step, in a sentence or two" aria-label="Why this step" />
            <button className="btn small btn-accent" disabled={!boardSize} onClick={() => { set({ steps: [...d.steps, { title: stepTitle, why: stepWhy, board: snap() }] }); setStepTitle(''); setStepWhy('') }}>Capture the board as step {d.steps.length + 1}</button>
          </div>
        </div>

        <div className="ed-col">
          <h4>Targets</h4>
          <label className="field"><span>p99 latency</span><span className="unit-input"><input type="number" min={1} value={d.targets.p99} onChange={(e) => setT({ p99: Number(e.target.value) })} /> ms or less</span></label>
          <label className="field"><span>Availability</span><span className="unit-input"><input type="number" min={50} max={100} step={0.1} value={+(d.targets.availability * 100).toFixed(2)} onChange={(e) => setT({ availability: Number(e.target.value) / 100 })} /> % or more</span></label>
          <label className="field"><span>Budget</span><span className="unit-input">$ <input type="number" min={0} value={d.targets.budget} onChange={(e) => setT({ budget: Number(e.target.value) })} /> a month</span></label>
          <label className="field"><span>Queue delay</span><span className="unit-input"><input type="number" min={0} value={d.targets.backlogSec} onChange={(e) => setT({ backlogSec: Number(e.target.value) })} /> s (0 = none)</span></label>
          <button className="linkbtn small" disabled={!hasShape} onClick={autoTargets}>Set targets from the reference answer</button>

          <h4>Design checks</h4>
          <ul className="ed-checks">
            {d.checks.map((c, i) => (
              <CheckRow key={i} c={c} onChange={(nc) => set({ checks: d.checks.map((x, j) => (j === i ? nc : x)) })} onRemove={() => set({ checks: d.checks.filter((_, j) => j !== i) })} />
            ))}
          </ul>
          <select aria-label="Add a design check" value="" onChange={(e) => { const p = CHECK_PRESETS[Number(e.target.value)]; if (p) set({ checks: [...d.checks, p.make()] }) }}>
            <option value="">Add a design check…</option>
            {CHECK_PRESETS.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}
          </select>
        </div>
      </section>

      <section className="ed-foot">
        <div className="btnrow">
          <button className="btn" disabled={!hasShape} onClick={run}>Test the reference answer</button>
          <button className="btn" disabled={!hasShape || !d.title.trim()} onClick={() => save(false)}>Save to my problems</button>
          <button className="btn btn-accent" disabled={!hasShape || !d.title.trim()} onClick={() => save(true)}>Save and copy challenge link</button>
          <button className="linkbtn small" disabled={!hasShape} onClick={() => {
            const spec = specFromDraft(d)
            const a = document.createElement('a')
            a.href = URL.createObjectURL(new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' }))
            a.download = `${spec.id}.challenge.json`
            a.click()
          }}>Download JSON</button>
        </div>
        {!hasShape && <p className="small muted">Capture at least one step of the reference answer to test or save.</p>}
        {test && (
          <ul className="sum-checks ed-test">
            {test.lines.map((l) => <li key={l.label} className={l.ok ? 'ok' : 'miss'}><span aria-hidden>{l.ok ? '✓' : '✗'}</span>{l.label}<em className="muted small"> {l.detail}</em></li>)}
          </ul>
        )}
      </section>
    </div>
  )
}

// ------------------------------------------------------------------ submit and results
export function SubmitDialog() {
  const open = useApp((s) => s.submitOpen)
  const setOpen = useApp((s) => s.setSubmitOpen)
  const [name, setName] = useState(() => localStorage.getItem('archsim:name') ?? '')
  const [link, setLink] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [r, setR] = useState<ResultPayload | null>(null)
  const make = () => {
    setBusy(true)
    setTimeout(() => {
      localStorage.setItem('archsim:name', name)
      const res = buildResult(name)
      setR(res)
      setLink(res ? resultLink(res) : null)
      setBusy(false)
    }, 30)
  }
  const close = () => { setOpen(false); setLink(null); setR(null) }
  return (
    <Dialog open={open} onClose={close} label="Send your answer">
      <div className="submit">
        <h2>Send your answer</h2>
        {!link ? (
          <>
            <p>This runs the 24-hour test on your board and makes a link with your design, notes and scores. Send it to your interviewer; nothing is uploaded anywhere.</p>
            <label className="field"><span>Your name</span><input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
            <div className="btnrow">
              <button className="btn btn-accent" onClick={make} disabled={busy}>{busy ? 'Running the test…' : 'Make the result link'}</button>
              <button className="btn" onClick={close}>Cancel</button>
            </div>
          </>
        ) : (
          <>
            {r && <ResultSummary r={r} />}
            <label className="field field-top"><span>Result link</span><textarea readOnly rows={3} value={link} onFocus={(e) => e.target.select()} /></label>
            <div className="btnrow">
              <button className="btn btn-accent" onClick={async () => useApp.getState().showToast((await copyText(link)) ? 'Result link copied' : 'Select the link and copy it')}>Copy link</button>
              <button className="btn" onClick={close}>Done</button>
            </div>
          </>
        )}
      </div>
    </Dialog>
  )
}

function ResultSummary({ r }: { r: ResultPayload }) {
  const t = r.report.targets
  const rows = [
    { k: 'p99 latency', v: r.report.availability > 0 ? fmtMs(r.report.p99) : 'nothing served', ok: r.report.availability > 0 && r.report.p99 <= t.p99, t: `≤ ${t.p99} ms` },
    { k: 'Availability', v: fmtPct(r.report.availability, 2), ok: r.report.availability >= t.availability, t: `≥ ${fmtPct(t.availability, 2)}` },
    { k: 'Monthly cost', v: fmtMoney(r.report.cost), ok: r.report.cost <= t.budget, t: `≤ ${fmtMoney(t.budget)}` },
    ...(t.backlogSec ? [{ k: 'Queue delay', v: `${Math.round(r.report.backlogSec)} s`, ok: r.report.backlogSec <= t.backlogSec, t: `≤ ${t.backlogSec} s` }] : []),
  ]
  const passedAll = rows.every((x) => x.ok) && r.report.checks.every((c) => c.ok)
  return (
    <div className="result">
      <p className={`verdict ${passedAll ? 'ok' : 'bad'}`}>{passedAll ? 'Meets every target and check.' : `Misses ${rows.filter((x) => !x.ok).length + r.report.checks.filter((c) => !c.ok).length} of ${rows.length + r.report.checks.length}.`}</p>
      <table className="tbl">
        <tbody>
          {rows.map((x) => <tr key={x.k}><td>{x.k}</td><td className="muted">{x.t}</td><td className={x.ok ? 'ok' : 'bad'}>{x.ok ? '✓' : '✗'} {x.v}</td></tr>)}
        </tbody>
      </table>
      <ul className="sum-checks">
        {r.report.checks.map((c) => <li key={c.label} className={c.ok ? 'ok' : 'miss'}><span aria-hidden>{c.ok ? '✓' : '✗'}</span>{c.label}</li>)}
      </ul>
    </div>
  )
}

export function ResultView() {
  const r = useApp((s) => s.resultView)
  const set = useApp((s) => s.setResultView)
  if (!r) return null
  const notes = Object.entries(r.notes ?? {}).filter(([, v]) => v.trim())
  return (
    <Dialog open={!!r} onClose={() => set(null)} label="Candidate result">
      <div className="submit">
        <h2>{r.candidate ? `${r.candidate}'s answer` : 'Candidate answer'}: {r.title}</h2>
        <p className="small muted">
          Sent {new Date(r.submittedAt).toLocaleString()}{r.minutesTaken !== undefined ? `, after ${r.minutesTaken} minutes` : ''}. Their design is on the board behind this window; close it to explore, break or stress-test it.
        </p>
        <ResultSummary r={r} />
        {notes.length > 0 && (
          <>
            <h4>Their notes</h4>
            {notes.map(([k, v]) => <div key={k} className="result-note"><b className="small">{k.replace(/-/g, ' ')}</b><p className="small">{v}</p></div>)}
          </>
        )}
        <div className="btnrow"><button className="btn btn-accent" onClick={() => set(null)}>Look at the design</button></div>
      </div>
    </Dialog>
  )
}

export type { Challenge }
