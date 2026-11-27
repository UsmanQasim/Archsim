import { useEffect, useMemo, useState } from 'react'
import { LESSONS, LESSON_ORDER, MODULES, lessonModule, type Lesson } from '../learn'
import { useRoute } from '../route'
import { useApp, useSim } from '../store'
import { fmtClock, fmtMoney, fmtMs, fmtNum, fmtPct } from '../format'
import { LOCATIONS } from '../sim/regions'
import { FlowCanvas } from './FlowCanvas'
import { Inspector } from './Inspector'

const DONE_KEY = 'archsim:lessons'
const loadDone = () => {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem(DONE_KEY) ?? '[]'))
  } catch {
    return new Set<string>()
  }
}
const markDone = (id: string) => {
  const s = loadDone()
  s.add(id)
  try {
    localStorage.setItem(DONE_KEY, JSON.stringify([...s]))
  } catch {
    /* ignore */
  }
}

const Ico = ({ d, size = 15 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
)

/** The course: lessons on the left, the live board in the middle, the step on the right. */
export function LearnPage() {
  const routeLesson = useRoute((s) => s.a)
  const go = useRoute((s) => s.go)
  const lesson = useApp((s) => s.lesson)
  const startLesson = useApp((s) => s.startLesson)
  const [done, setDone] = useState(loadDone)
  const [courseOpen, setCourseOpen] = useState(false)

  // the address picks the lesson; with none, carry on where the learner left off
  useEffect(() => {
    const want = routeLesson && LESSONS.some((l) => l.id === routeLesson) ? routeLesson : LESSON_ORDER.find((id) => !loadDone().has(id)) ?? LESSON_ORDER[0]
    if (!routeLesson || routeLesson !== want) {
      go({ page: 'learn', a: want })
      return
    }
    if (useApp.getState().lesson?.id !== want) startLesson(want)
  }, [routeLesson, go, startLesson])

  const l = lesson && LESSONS.find((x) => x.id === lesson.id)
  const finish = (id: string) => {
    markDone(id)
    setDone(loadDone())
  }
  return (
    <div className={`learn-page ${courseOpen ? 'course-open' : ''}`}>
      <CourseTree current={l?.id} done={done} onPick={(id) => { setCourseOpen(false); go({ page: 'learn', a: id }) }} />
      {courseOpen && <div className="scrim" onClick={() => setCourseOpen(false)} aria-hidden />}
      {l && lesson ? (
        <>
          <LessonStage lesson={l} step={lesson.step} onCourse={() => setCourseOpen(true)} />
          <StepPanel lesson={l} step={lesson.step} done={done} onFinish={finish} />
        </>
      ) : (
        <div className="pane-loading">Loading the lesson…</div>
      )}
    </div>
  )
}

function CourseTree({ current, done, onPick }: { current?: string; done: Set<string>; onPick: (id: string) => void }) {
  const curModule = current ? lessonModule(current)?.id : undefined
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const isOpen = (id: string) => open[id] ?? id === curModule
  const total = LESSON_ORDER.length
  const finished = LESSON_ORDER.filter((id) => done.has(id)).length
  return (
    <aside className="course" aria-label="Course">
      <div className="course-head">
        <b>Course</b>
        <span className="muted small">{total} lessons</span>
      </div>
      <ol className="course-modules">
        {MODULES.map((m, mi) => {
          const n = m.lessons.filter((id) => done.has(id)).length
          return (
            <li key={m.id} className="course-module">
              <button className="course-module-btn" aria-expanded={isOpen(m.id)} onClick={() => setOpen((o) => ({ ...o, [m.id]: !isOpen(m.id) }))}>
                <span className="course-caret" aria-hidden>{isOpen(m.id) ? '▾' : '▸'}</span>
                <span className="course-folder" style={{ background: `var(${m.color})` }} aria-hidden />
                <span className="grow">{String(mi + 1).padStart(2, '0')}. {m.title}</span>
                <span className="course-count">{n}/{m.lessons.length}</span>
              </button>
              {isOpen(m.id) && (
                <ol className="course-lessons">
                  {m.lessons.map((id) => {
                    const l = LESSONS.find((x) => x.id === id)!
                    return (
                      <li key={id}>
                        <a
                          href={`#/learn/${id}`}
                          className={`course-lesson ${id === current ? 'on' : ''} ${done.has(id) ? 'done' : ''}`}
                          aria-current={id === current ? 'page' : undefined}
                          onClick={(e) => { e.preventDefault(); onPick(id) }}
                        >
                          <span className="course-tick" aria-hidden>{done.has(id) ? '✓' : ''}</span>
                          {l.title}
                        </a>
                      </li>
                    )
                  })}
                </ol>
              )}
            </li>
          )
        })}
      </ol>
      <div className="course-progress">
        <span>Progress</span>
        <b>{finished} / {total}</b>
        <div className="course-bar" role="progressbar" aria-label="Lessons finished" aria-valuemin={0} aria-valuemax={total} aria-valuenow={finished}>
          <span style={{ width: `${(finished / total) * 100}%` }} />
        </div>
      </div>
    </aside>
  )
}

function LessonStage({ lesson, step, onCourse }: { lesson: Lesson; step: number; onCourse: () => void }) {
  const m = lessonModule(lesson.id)!
  const idx = m.lessons.indexOf(lesson.id)
  const lessonTo = useApp((s) => s.lessonTo)
  const selection = useApp((s) => s.selection)
  const select = useApp((s) => s.select)
  return (
    <section className="lesson-stage">
      <header className="lesson-head">
        <div className="lesson-head-text">
          <div className="lesson-crumbs small">
            <button className="tbtn small course-toggle" onClick={onCourse}>Course</button>
            <span>{m.title}</span>
            <span aria-hidden>/</span>
            <span>Lesson {idx + 1} of {m.lessons.length}</span>
          </div>
          <h1>{lesson.title}</h1>
          <p className="muted">{lesson.summary}</p>
        </div>
        <div className="lesson-chips">
          <span className="pill pill-traffic">{lesson.minutes} min</span>
          {lesson.level && <span className="pill pill-messaging">{lesson.level}</span>}
          <span className="pill pill-data">{lesson.steps.length} steps</span>
        </div>
      </header>
      <div className="lesson-board">
        <BoardBar />
        <div className="lesson-canvas">
          <FlowCanvas />
          {selection && (
            <div className="lesson-insp" role="region" aria-label="Details of the selected part">
              <button className="iconbtn lesson-insp-close" onClick={() => select(null)} aria-label="Close details">✕</button>
              <Inspector />
            </div>
          )}
        </div>
      </div>
      <nav className="stepper" aria-label="Steps in this lesson">
        <div className="stepper-head small">
          <b>In this lesson</b>
          <span className="muted">Step {step + 1} of {lesson.steps.length}</span>
        </div>
        <ol>
          {lesson.steps.map((s, i) => (
            <li key={s.title} className={`${i < step ? 'past' : ''} ${i === step ? 'on' : ''}`}>
              <button onClick={() => lessonTo(i)} aria-current={i === step ? 'step' : undefined}>
                <span className="stepper-dot">{i + 1}</span>
                <span className="stepper-label">{s.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
    </section>
  )
}

/** Live numbers, the clock, and the few ways to break things a lesson needs. */
function BoardBar() {
  const res = useSim((s) => s.result)
  const playing = useApp((s) => s.playing)
  const togglePlay = useApp((s) => s.togglePlay)
  const time = useApp((s) => s.time)
  const setTime = useApp((s) => s.setTime)
  const nodes = useApp((s) => s.nodes)
  const chaos = useApp((s) => s.chaos)
  const toggleAZ = useApp((s) => s.toggleAZ)
  const toggleRegion = useApp((s) => s.toggleRegion)
  const setTrafficMult = useApp((s) => s.setTrafficMult)
  const flushAllCaches = useApp((s) => s.flushAllCaches)
  const clearChaos = useApp((s) => s.clearChaos)
  const [breakOpen, setBreakOpen] = useState(false)
  const regions = useMemo(() => [...new Set(nodes.filter((n) => n.data.kind !== 'client' && LOCATIONS.some((r) => r.cloud && r.id === n.data.config.region)).map((n) => n.data.config.region))], [nodes])
  const T = res?.totals
  const tod = ((time % 86400) + 86400) % 86400
  const broken = chaos.failedNodes.length + chaos.failedRegions.length + (chaos.failedAZs?.length ?? 0) + (chaos.trafficMult !== 1 ? 1 : 0)
  return (
    <div className="board-bar">
      <div className="stat-boxes">
        <Stat k="Requests" v={T ? `${fmtNum(T.offered)}/s` : '—'} />
        <Stat k="Succeed" v={T ? fmtPct(T.availability, 2) : '—'} bad={!!T && T.availability < 0.999} />
        <Stat k="p99" v={T ? fmtMs(T.p99) : '—'} bad={!!T && T.p99 > 800} />
        <Stat k="Per month" v={T ? fmtMoney(T.monthlyCost) : '—'} />
      </div>
      <div className="board-bar-tools">
        <div className="mini-clock">
          <button className="btn small" onClick={togglePlay} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? <Ico d="M8 5v14M16 5v14" /> : <Ico d="M7 4.5v15l12-7.5z" />}
            <span>{playing ? 'Pause' : 'Play'}</span>
          </button>
          <label className="mini-time">
            <span className="small">{fmtClock(time)}</span>
            <input type="range" min={0} max={86399} step={300} value={tod} onChange={(e) => setTime(Math.floor(time / 86400) * 86400 + Number(e.target.value))} aria-label="Time of day" />
          </label>
        </div>
        <div className="menu">
          <button className={`btn small ${broken ? 'btn-danger' : ''}`} aria-expanded={breakOpen} onClick={() => setBreakOpen(!breakOpen)}>
            Break it{broken ? ` (${broken})` : ''}
          </button>
          {breakOpen && (
            <div className="menu-pop break-pop" onPointerLeave={() => setBreakOpen(false)}>
              {regions.map((r) => {
                const loc = LOCATIONS.find((x) => x.id === r)
                const name = loc?.name ?? r
                const zone = loc?.short ?? r
                return (
                  <div key={r} className="break-row">
                    <span className="small muted">{name}</span>
                    <div className="chips">
                      <button className={`chip ${(chaos.failedAZs ?? []).includes(r) ? 'on' : ''}`} onClick={() => toggleAZ(r)}>Lose a zone ({zone})</button>
                      <button className={`chip ${chaos.failedRegions.includes(r) ? 'on' : ''}`} onClick={() => toggleRegion(r)}>Lose the region</button>
                    </div>
                  </div>
                )
              })}
              <div className="break-row">
                <span className="small muted">Traffic</span>
                <div className="chips">
                  {[1, 2, 5, 10].map((x) => (
                    <button key={x} className={`chip ${chaos.trafficMult === x ? 'on-accent' : ''}`} onClick={() => setTrafficMult(x)}>×{x}</button>
                  ))}
                </div>
              </div>
              <div className="btnrow">
                <button className="btn small" onClick={flushAllCaches}>Empty every cache</button>
                <button className="btn small" onClick={clearChaos} disabled={!broken}>Fix everything</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const Stat = ({ k, v, bad }: { k: string; v: string; bad?: boolean }) => (
  <div className={`stat-box ${bad ? 'bad' : ''}`}>
    <span>{k}</span>
    <b>{v}</b>
  </div>
)

function StepPanel({ lesson, step, done, onFinish }: { lesson: Lesson; step: number; done: Set<string>; onFinish: (id: string) => void }) {
  const lessonTo = useApp((s) => s.lessonTo)
  const nodes = useApp((s) => s.nodes)
  const edges = useApp((s) => s.edges)
  const chaos = useApp((s) => s.chaos)
  const result = useSim((s) => s.result)
  const go = useRoute((s) => s.go)
  const st = lesson.steps[step]
  const ok = !!(st.task && result && st.task.done({ nodes, edges, result, chaos }))
  const last = step === lesson.steps.length - 1
  const order = LESSON_ORDER.indexOf(lesson.id)
  const nextLesson = LESSONS.find((l) => l.id === LESSON_ORDER[order + 1])
  // finishing the last step counts the lesson as done
  useEffect(() => {
    if (last) onFinish(lesson.id)
  }, [last, lesson.id, onFinish])
  const kind = st.task ? (ok ? 'Done' : 'Your turn') : step === 0 ? 'The problem' : last ? 'Recap' : 'Explain'
  return (
    <aside className="step-panel" aria-label="Lesson step">
      <div className="step-card">
        <div className="step-top">
          <span className="small muted">Step {step + 1} of {lesson.steps.length}</span>
          <span className={`pill ${ok ? 'pill-messaging' : st.task ? 'pill-edge' : step === 0 ? 'pill-ai' : 'pill-compute'}`}>{kind}</span>
        </div>
        <h2>{st.title}</h2>
        <div className="step-text">
          {st.text.map((t) => <p key={t}>{t}</p>)}
        </div>
        {st.idea && (
          <div className="idea">
            <span className="idea-ico" aria-hidden><Ico d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3Z" /></span>
            <div>
              <b className="small">Key idea</b>
              <p>{st.idea}</p>
            </div>
          </div>
        )}
        {st.task && (
          <div className={`task ${ok ? 'ok' : ''}`} role="status" aria-live="polite">
            <b>{ok ? 'Done. ' : 'Your turn. '}</b>
            {ok ? st.task.success : st.task.prompt}
          </div>
        )}
        <div className="step-nav">
          <button className="btn" onClick={() => lessonTo(step - 1)} disabled={step === 0}>← Back</button>
          {!last && (
            <button className={`btn ${!st.task || ok ? 'btn-accent' : ''}`} onClick={() => lessonTo(step + 1)}>
              {st.task && !ok ? 'Skip this step' : `Next: ${lesson.steps[step + 1].title}`}
            </button>
          )}
          {last && nextLesson && <button className="btn btn-accent" onClick={() => go({ page: 'learn', a: nextLesson.id })}>Next lesson: {nextLesson.title}</button>}
          {last && !nextLesson && <button className="btn btn-accent" onClick={() => go({ page: 'library' })}>Try a real problem</button>}
        </div>
      </div>
      {lesson.outcomes && (
        <div className="learn-card">
          <b className="small">You will learn</b>
          <ul className="outcomes">
            {lesson.outcomes.map((o, i) => {
              const got = done.has(lesson.id) || i < Math.round(((step + (ok ? 1 : 0)) / lesson.steps.length) * lesson.outcomes!.length)
              return <li key={o} className={got ? 'got' : ''}><span aria-hidden>{got ? '✓' : ''}</span>{o}</li>
            })}
          </ul>
        </div>
      )}
    </aside>
  )
}
