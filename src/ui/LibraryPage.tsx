import { useMemo, useState } from 'react'
import { ARTICLES, THEMES, findArticle, type Article, type Theme } from '../library/articles'
import { useRoute } from '../route'
import { useApp } from '../store'
import { fmtMoney, fmtPct } from '../format'
import { CATALOG, catVars } from '../sim/catalog'
import { allChallenges, customChallenges, findChallenge, type Challenge } from '../sim/scenarios'
import { ChallengeEditor, ProblemList } from './Bank'

type Tab = 'cases' | 'problems' | 'yours' | 'create'
const TABS: { id: Tab; label: string }[] = [
  { id: 'cases', label: 'Real systems' },
  { id: 'problems', label: 'Problems' },
  { id: 'yours', label: 'Your challenges' },
  { id: 'create', label: 'Create a challenge' },
]

/** Case studies from engineering blogs, the problem set, and the challenge editor. */
export function LibraryPage() {
  const a = useRoute((s) => s.a)
  const b = useRoute((s) => s.b)
  if (a === 'company') return <CaseStudy id={b} />
  const tab: Tab = TABS.some((t) => t.id === a) ? (a as Tab) : 'cases'
  return <LibraryHome tab={tab} />
}

function LibraryHome({ tab }: { tab: Tab }) {
  const go = useRoute((s) => s.go)
  useApp((s) => s.customVersion)
  const problems = allChallenges().length
  const mine = customChallenges().length
  return (
    <div className="library">
      <header className="lib-head">
        <div>
          <h1>Library</h1>
          <p className="muted">How real companies solved their scaling problems, explained with sources and a board you can run. Plus {problems} problems to practise on, {ARTICLES.length} of them modelled on those companies.</p>
        </div>
        <nav className="seg lib-tabs" aria-label="Library sections">
          {TABS.map((t) => (
            <a key={t.id} href={`#/library/${t.id}`} className={tab === t.id ? 'on' : ''} aria-current={tab === t.id ? 'page' : undefined}
              onClick={(e) => { e.preventDefault(); go({ page: 'library', a: t.id }) }}>
              {t.label}{t.id === 'yours' && mine ? <span className="lib-count">{mine}</span> : null}
            </a>
          ))}
        </nav>
      </header>
      <div className="lib-body">
        {tab === 'cases' && <CaseGrid />}
        {tab === 'problems' && <div className="lib-panel"><ProblemList /></div>}
        {tab === 'yours' && (mine
          ? <div className="lib-panel"><ProblemList mine /></div>
          : (
            <div className="lib-panel lib-empty">
              <h2>No challenges of your own yet</h2>
              <p className="muted">Build a reference answer on the board, set targets, and share it as a link. Challenges you make or open from a link appear here.</p>
              <button className="btn btn-accent" onClick={() => go({ page: 'library', a: 'create' })}>Create a challenge</button>
            </div>
          ))}
        {tab === 'create' && <div className="lib-panel"><ChallengeEditor /></div>}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ case study grid
function CaseGrid() {
  const go = useRoute((s) => s.go)
  const passed = useApp((s) => s.passed)
  const [q, setQ] = useState('')
  const [theme, setTheme] = useState<Theme | 'All'>('All')
  const query = q.trim().toLowerCase()
  const list = ARTICLES.filter((a) =>
    (theme === 'All' || a.themes.includes(theme)) &&
    (!query || `${a.company} ${a.headline} ${a.lede} ${a.themes.join(' ')} ${(findChallenge(a.challenge)?.tags ?? []).join(' ')}`.toLowerCase().includes(query)),
  )
  return (
    <>
      <div className="lib-filters">
        <input className="search" type="search" placeholder="Search companies or ideas, e.g. sharding, Kafka, Netflix" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search case studies" />
        <div className="lib-themes" role="group" aria-label="Theme">
          {(['All', ...THEMES] as const).map((t) => (
            <button key={t} className={`chip ${theme === t ? 'on-accent' : ''}`} aria-pressed={theme === t} onClick={() => setTheme(t)}>{t}</button>
          ))}
        </div>
      </div>
      <ul className="case-grid">
        {list.map((a) => {
          const c = findChallenge(a.challenge)
          const n = a.numbers[0]
          return (
            <li key={a.id}>
              <a className="case-card" href={`#/library/company/${a.id}`} onClick={(e) => { e.preventDefault(); go({ page: 'library', a: 'company', b: a.id }) }}>
                <span className="case-co">{a.company}{c && passed[c.id] ? <span className="case-done" title="Challenge solved" aria-label="Challenge solved">✓</span> : null}</span>
                <span className="case-title">{a.headline}</span>
                {n && <span className="case-num"><b>{n.value}</b> {n.label}</span>}
                <span className="case-meta">
                  {c && <span className={`diff d-${c.difficulty}`}>{c.difficulty}</span>}
                  {a.themes.slice(0, 2).map((t) => <span key={t} className="ptag">{t}</span>)}
                </span>
              </a>
            </li>
          )
        })}
      </ul>
      {!list.length && <p className="muted lib-none">No case studies match. Clear the theme or try another word.</p>}
    </>
  )
}

// ------------------------------------------------------------------ one case study
function CaseStudy({ id }: { id?: string }) {
  const go = useRoute((s) => s.go)
  const a = findArticle(id) ?? ARTICLES.find((x) => x.challenge === id)
  if (!a) {
    return (
      <div className="library">
        <div className="lib-panel lib-empty">
          <h2>That case study is not here</h2>
          <p className="muted">The link may be old. Every case study is listed in the library.</p>
          <button className="btn btn-accent" onClick={() => go({ page: 'library' })}>Open the library</button>
        </div>
      </div>
    )
  }
  const c = findChallenge(a.challenge)
  const i = ARTICLES.indexOf(a)
  const prev = ARTICLES[(i - 1 + ARTICLES.length) % ARTICLES.length]
  const next = ARTICLES[(i + 1) % ARTICLES.length]
  return (
    <article className="library case">
      <header className="case-head">
        <nav className="lesson-crumbs small" aria-label="Breadcrumb">
          <a href="#/library/cases" onClick={(e) => { e.preventDefault(); go({ page: 'library', a: 'cases' }) }}>Library</a>
          <span aria-hidden>/</span>
          <span>{a.company}</span>
        </nav>
        <h1>{a.headline}</h1>
        <p className="case-lede">{a.lede}</p>
        <div className="case-themes">{a.themes.map((t) => <span key={t} className="ptag">{t}</span>)}</div>
      </header>

      {c && <Evolution c={c} />}

      <div className="case-cols">
        <div className="case-main">
          {a.sections.map((s) => (
            <section key={s.title} className="case-sec">
              <h2>{s.title}</h2>
              {s.body.map((p, k) => <p key={k}><Cited text={p} sources={a.sources} /></p>)}
            </section>
          ))}
          <section className="case-sec">
            <h2>What to take away</h2>
            <ul className="case-lessons">{a.lessons.map((l) => <li key={l}>{l}</li>)}</ul>
          </section>
          <section className="case-sec case-sources" id="sources">
            <h2>Sources</h2>
            <ol>
              {a.sources.map((s, k) => (
                <li key={s.url} id={`src-${a.id}-${k + 1}`}>
                  <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a>
                  <span className="muted"> {s.publisher}, {s.year}</span>
                </li>
              ))}
            </ol>
            <p className="small muted">Figures are what each company published at the time. The simulator board is a scaled-down model with the same shape, not the real system.</p>
          </section>
          <nav className="case-pager" aria-label="More case studies">
            <a href={`#/library/company/${prev.id}`} onClick={(e) => { e.preventDefault(); go({ page: 'library', a: 'company', b: prev.id }) }}><span className="muted small">Previous</span>{prev.company}</a>
            <a href={`#/library/company/${next.id}`} onClick={(e) => { e.preventDefault(); go({ page: 'library', a: 'company', b: next.id }) }}><span className="muted small">Next</span>{next.company}</a>
          </nav>
        </div>

        <aside className="case-aside">
          <section className="case-box">
            <h2>Key numbers</h2>
            <dl className="case-numbers">
              {a.numbers.map((n) => (
                <div key={n.label}>
                  <dt>{n.value}</dt>
                  <dd>{n.label} <a className="cite" href={`#src-${a.id}-${n.src}`} onClick={(e) => { e.preventDefault(); document.getElementById(`src-${a.id}-${n.src}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }} aria-label={`Source ${n.src}`}>[{n.src}]</a></dd>
                </div>
              ))}
            </dl>
          </section>
          {c && <ChallengeBox c={c} />}
        </aside>
      </div>
    </article>
  )
}

/** Paragraph text with [n] turned into links to the source list. */
function Cited({ text, sources }: { text: string; sources: Article['sources'] }) {
  const parts = text.split(/(\[\d+\])/g)
  return (
    <>
      {parts.map((p, k) => {
        const m = /^\[(\d+)\]$/.exec(p)
        const s = m && sources[Number(m[1]) - 1]
        return s ? <a key={k} className="cite" href={s.url} target="_blank" rel="noreferrer" title={`${s.title} (${s.publisher}, ${s.year})`}>{p}</a> : <span key={k}>{p}</span>
      })}
    </>
  )
}

function ChallengeBox({ c }: { c: Challenge }) {
  const startChallenge = useApp((s) => s.startChallenge)
  const startGuide = useApp((s) => s.startGuide)
  const go = useRoute((s) => s.go)
  const passed = useApp((s) => s.passed[c.id])
  const open = (fn: () => void) => { fn(); go({ page: 'lab' }) }
  return (
    <section className="case-box case-challenge">
      <div className="case-ch-head">
        <h2>Run it yourself</h2>
        <span className={`diff d-${c.difficulty}`}>{c.difficulty}</span>
      </div>
      <p>{c.brief}</p>
      <ul className="case-targets">
        <li><span>p99 latency</span><b>≤ {c.targets.p99} ms</b></li>
        <li><span>Availability</span><b>≥ {fmtPct(c.targets.availability, 1)}</b></li>
        <li><span>Budget</span><b>≤ {fmtMoney(c.targets.budget)}/mo</b></li>
      </ul>
      {passed && <p className="small case-passed">✓ You solved this one</p>}
      <div className="btnrow">
        <button className="btn btn-accent" onClick={() => open(() => startChallenge(c.id))}>Start the challenge</button>
        <button className="btn" onClick={() => open(() => startGuide(c.id))}>Walk through the answer</button>
      </div>
      <p className="small muted">The challenge opens in the simulator with only the users on the board. The walkthrough builds the answer one step at a time.</p>
    </section>
  )
}

// ------------------------------------------------------------------ the board, step by step
function Evolution({ c }: { c: Challenge }) {
  const [step, setStep] = useState(c.steps.length - 1)
  const g = useMemo(() => c.build(step), [c, step])
  const s = c.steps[step]
  return (
    <section className="case-evo" aria-label="How the design changes">
      <div className="case-evo-head">
        <h2>The design, step by step</h2>
        <div className="seg" role="tablist" aria-label="Step">
          {c.steps.map((x, k) => (
            <button key={k} role="tab" aria-selected={k === step} className={k === step ? 'on' : ''} onClick={() => setStep(k)} title={x.title}>{k + 1}</button>
          ))}
        </div>
      </div>
      <div className="mini-scroll" tabIndex={0} role="region" aria-label="Diagram, scrolls sideways on small screens"><MiniBoard nodes={g.nodes} edges={g.edges} /></div>
      <div className="case-evo-step" aria-live="polite">
        <b>{step + 1}. {s.title}</b>
        <p>{s.why}</p>
      </div>
    </section>
  )
}

const NW = 180
const NH = 54
function MiniBoard({ nodes, edges }: { nodes: ReturnType<Challenge['build']>['nodes']; edges: ReturnType<Challenge['build']>['edges'] }) {
  if (!nodes.length) return null
  const xs = nodes.map((n) => n.position.x)
  const ys = nodes.map((n) => n.position.y)
  const minX = Math.min(...xs) - 16
  const minY = Math.min(...ys) - 16
  const w = Math.max(...xs) + NW + 16 - minX
  const h = Math.max(...ys) + NH + 16 - minY
  const at = new Map(nodes.map((n) => [n.id, n.position]))
  return (
    <svg className="mini-board" style={{ maxWidth: Math.round(w * 0.78) }} viewBox={`${minX} ${minY} ${w} ${h}`} role="img" aria-label={`Diagram: ${nodes.map((n) => n.data.label || CATALOG[n.data.kind].label).join(', ')}`}>
      <defs>
        <marker id="mb-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="var(--line-2)" />
        </marker>
      </defs>
      {edges.map((e) => {
        const a = at.get(e.source)
        const b = at.get(e.target)
        if (!a || !b) return null
        const x1 = a.x + NW
        const y1 = a.y + NH / 2
        const x2 = b.x
        const y2 = b.y + NH / 2
        const back = x2 < x1
        const d = back
          ? `M${a.x + NW / 2},${a.y + NH} C${a.x + NW / 2},${a.y + NH + 60} ${b.x + NW / 2},${b.y + NH + 60} ${b.x + NW / 2},${b.y + NH}`
          : `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2 - 2},${y2}`
        const async = e.data?.mode === 'all'
        return <path key={e.id} d={d} fill="none" stroke="var(--line-2)" strokeWidth={2} strokeDasharray={async ? '6 5' : undefined} markerEnd="url(#mb-arrow)" />
      })}
      {nodes.map((n) => {
        const label = n.data.label || CATALOG[n.data.kind].label
        const short = label.length > 17 ? label.slice(0, 16) + '…' : label
        return (
          <g key={n.id} transform={`translate(${n.position.x},${n.position.y})`} style={catVars(n.data.kind) as React.CSSProperties}>
            <rect width={NW} height={NH} rx={10} fill="var(--cat)" stroke="var(--outline)" strokeWidth={1.5} />
            <text x={12} y={21} className="mb-kind">{CATALOG[n.data.kind].label}</text>
            <text x={12} y={42} className="mb-label">{short}</text>
            <title>{label}</title>
          </g>
        )
      })}
    </svg>
  )
}
