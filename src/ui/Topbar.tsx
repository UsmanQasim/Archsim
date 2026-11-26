import { useEffect, useRef, useState, type ReactNode } from 'react'
import { TEMPLATES, CHALLENGES } from '../sim/scenarios'
import { patternFactor } from '../sim/engine'
import { PROVIDERS } from '../sim/catalog'
import { copyDesignDoc, downloadDesignDoc } from '../doc'
import type { Provider } from '../sim/types'
import { dayNumber, fmtClock } from '../format'
import { useApp, type View } from '../store'
import { PracticeTimer } from './Practice'
import { exportBoardPng } from '../exportImage'
import { useDrawer } from '../layout'

const Chevron = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ marginLeft: 4, verticalAlign: -1 }}>
    <path d="m6 9 6 6 6-6" />
  </svg>
)
const Ico = ({ d, size = 18 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
)

function Menu({ label, children, wide, className, icon }: { label: string; children: (close: () => void) => ReactNode; wide?: boolean; className?: string; icon?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    window.addEventListener('pointerdown', h)
    window.addEventListener('keydown', k)
    return () => {
      window.removeEventListener('pointerdown', h)
      window.removeEventListener('keydown', k)
    }
  }, [open])
  return (
    <div className={`menu ${className ?? ''}`} ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        className={`tbtn ${open ? 'on' : ''}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={icon ? label : undefined}
        title={icon ? label : undefined}
      >
        {icon ?? <>{label}<Chevron /></>}
      </button>
      {open && <div className={`menu-pop ${wide ? 'wide' : ''}`}>{children(() => setOpen(false))}</div>}
    </div>
  )
}

const SPEEDS = [
  { v: 1, l: 'Real time' },
  { v: 60, l: '1 min / s' },
  { v: 600, l: '10 min / s' },
  { v: 1800, l: '30 min / s' },
  { v: 3600, l: '1 h / s' },
]

export function Topbar() {
  const title = useApp((s) => s.title)
  const saveStatus = useApp((s) => s.saveStatus)
  const setTitle = useApp((s) => s.setTitle)
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const playing = useApp((s) => s.playing)
  const togglePlay = useApp((s) => s.togglePlay)
  const speed = useApp((s) => s.speed)
  const setSpeed = useApp((s) => s.setSpeed)
  const time = useApp((s) => s.time)
  const setTime = useApp((s) => s.setTime)
  const undo = useApp((s) => s.undo)
  const redo = useApp((s) => s.redo)
  const canUndo = useApp((s) => s.past.length > 0)
  const canRedo = useApp((s) => s.future.length > 0)
  const loadTemplate = useApp((s) => s.loadTemplate)
  const startChallenge = useApp((s) => s.startChallenge)
  const shareLink = useApp((s) => s.shareLink)
  const exportJson = useApp((s) => s.exportJson)
  const importJson = useApp((s) => s.importJson)
  const setHelp = useApp((s) => s.setHelp)
  const provider = useApp((s) => s.provider)
  const setProvider = useApp((s) => s.setProvider)
  const startGuide = useApp((s) => s.startGuide)
  const passed = useApp((s) => s.passed)
  const theme = useApp((s) => s.theme)
  const toggleTheme = useApp((s) => s.toggleTheme)
  const fileRef = useRef<HTMLInputElement>(null)
  const drawer = useDrawer((s) => s.drawer)
  const toggleDrawer = useDrawer((s) => s.toggle)
  const tod = ((time % 86400) + 86400) % 86400
  const load = patternFactor('daily', tod)

  return (
    <header className="topbar">
      <button className={`tbtn only-compact ${drawer === 'palette' ? 'on' : ''}`} onClick={() => toggleDrawer('palette')} aria-label="Components" title="Components" aria-expanded={drawer === 'palette'}>
        <Ico d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM17 14v6M14 17h6" />
      </button>
      <div className="brand">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="4" width="6" height="5" rx="1.5" />
          <rect x="15" y="4" width="6" height="5" rx="1.5" />
          <rect x="9" y="15" width="6" height="5" rx="1.5" />
          <path d="M6 9v2.5c0 1 .8 1.5 1.8 1.5H12m6-4v2.5c0 1-.8 1.5-1.8 1.5H12m0 0v2" />
        </svg>
        <span>ArchSim</span>
      </div>
      <div className="title-wrap">
        <input className="title-input" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Design title" />
      </div>
      <span className={`save-status ${saveStatus}`} role="status" aria-live="polite" title={saveStatus === 'error' ? 'Local saving is unavailable' : 'Changes are saved in this browser'}>
        <i aria-hidden />
        {saveStatus === 'saving' ? 'Saving' : saveStatus === 'error' ? 'Not saved' : 'Saved'}
      </span>

      <Menu label="Templates" className="hide-narrow">
        {(close) => TEMPLATES.map((t) => (
          <button key={t.id} className="menu-item" onClick={() => { loadTemplate(t.id); close() }}>
            <b>{t.title}</b>
            <span>{t.blurb}</span>
          </button>
        ))}
      </Menu>
      <Menu label="Challenges" wide className="hide-narrow">
        {(close) => [
          <div key="_progress" className="menu-progress small">{CHALLENGES.filter((c) => passed[c.id]).length} of {CHALLENGES.length} passed</div>,
          ...CHALLENGES.map((c) => (
          <div key={c.id} className="menu-row">
            <button className="menu-item" onClick={() => { startChallenge(c.id); close() }}>
              <b>{c.title} <em className={`diff d-${c.difficulty}`}>{c.difficulty}</em>{passed[c.id] && <em className="passed-tag">passed</em>}</b>
              <span>{c.brief}</span>
            </button>
            <button className="tbtn small" title="Walk through a reference solution step by step" onClick={() => { startGuide(c.id); close() }}>See solution</button>
          </div>
        )),
        ]}
      </Menu>

      <div className="seg view-seg" role="group" aria-label="View">
        {(['2d', 'split', '3d', 'map'] as View[]).map((v) => (
          <button key={v} className={`${view === v ? 'on' : ''} ${v === 'split' ? 'hide-compact' : ''}`} onClick={() => setView(v)}>{v === '2d' ? 'Board' : v === '3d' ? 'Model' : v === 'map' ? 'Map' : 'Both'}</button>
        ))}
      </div>

      <select className="provider hide-narrow hide-mid" value={provider} onChange={(e) => setProvider(e.target.value as Provider)} aria-label="Cloud provider naming" title="Show product names for this cloud">
        {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
      </select>

      <div className="clock">
        <button className="play" onClick={togglePlay} title="Play or pause the clock (Space)" aria-label={playing ? 'Pause' : 'Play'}>
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><rect x="5" y="4" width="5" height="16" rx="1.5" /><rect x="14" y="4" width="5" height="16" rx="1.5" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5Z" /></svg>
          )}
        </button>
        <div className="clock-face" title="Simulated time of day">
          <span className="clock-day">Day {dayNumber(time)}</span>
          <span className="clock-time">{fmtClock(time)}</span>
        </div>
        <div className="scrub-box" title={`Daily wave level: ${Math.round(load * 100)}% of peak`}>
          <input
            className="scrub"
            type="range"
            min={0}
            max={86399}
            step={300}
            value={tod}
            onChange={(e) => setTime(Math.floor(time / 86400) * 86400 + Number(e.target.value))}
            aria-label="Time of day"
          />
          <div className="scrub-meter" aria-hidden="true">
            <span style={{ width: `${Math.round(load * 100)}%` }} />
          </div>
        </div>
        <select className="hide-narrow hide-mid" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} aria-label="Simulation speed">
          {SPEEDS.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
        </select>
      </div>

      <div className="tools">
        <PracticeTimer />
        <button className={`tbtn only-compact ${drawer === 'inspector' ? 'on' : ''}`} onClick={() => toggleDrawer('inspector')} aria-label="Details" title="Details of the selected part" aria-expanded={drawer === 'inspector'}>
          <Ico d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4" />
        </button>
        <button className="tbtn hide-narrow" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo"><Ico d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></button>
        <button className="tbtn hide-narrow" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo"><Ico d="m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></button>
        <Menu label="File" className="hide-narrow hide-sm">
          {(close) => (
            <>
              <button className="menu-item" onClick={() => { shareLink(); close() }}><b>Copy share link</b><span>The whole design fits in the link. No account needed.</span></button>
              <button className="menu-item" onClick={() => { downloadDesignDoc(); close() }}><b>Download design doc</b><span>A Markdown write-up: traffic, components, flow, numbers, open issues.</span></button>
              <button className="menu-item" onClick={() => { copyDesignDoc(); close() }}><b>Copy design doc</b><span>The same write-up, ready to paste into Notion, GitHub or your notes.</span></button>
              <button className="menu-item" onClick={() => { exportBoardPng(); close() }}><b>Save board as image</b><span>A PNG of the whiteboard, for slides, notes or a write-up.</span></button>
              <button className="menu-item" onClick={() => { exportJson(); close() }}><b>Export JSON</b><span>Download this design as a file you can import later.</span></button>
              <button className="menu-item" onClick={() => { fileRef.current?.click(); close() }}><b>Import JSON</b><span>Open a design file.</span></button>
            </>
          )}
        </Menu>
        <button className="tbtn hide-narrow hide-mid" onClick={toggleTheme} aria-label={theme === 'light' ? 'Switch to night mode' : 'Switch to day mode'} title={theme === 'light' ? 'Night mode' : 'Day mode'}>
          {theme === 'light' ? <Ico d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /> : <Ico d="M12 3v2M12 19v2M5 12H3M21 12h-2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />}
        </button>
        <MoreMenu onImport={() => fileRef.current?.click()} />
        <button className="tbtn hide-narrow hide-mid" onClick={() => setHelp(true)} aria-label="Help" title="How to use ArchSim"><Ico d="M9.2 9a3 3 0 0 1 5.6 1.2c0 2-2.8 2.4-2.8 4.3M12 17.6v.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" /></button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) f.text().then(importJson)
            e.target.value = ''
          }}
        />
      </div>
    </header>
  )
}

/** Phone menu: everything the top bar hides on small screens, one level deep. */
function MoreMenu({ onImport }: { onImport: () => void }) {
  const [sub, setSub] = useState<'root' | 'templates' | 'challenges' | 'file'>('root')
  const s = useApp()
  const back = <button className="menu-back" onClick={() => setSub('root')}><Chevron /> Back</button>
  return (
    <Menu label="More" className="only-mid menu-more" icon={<Ico d="M4 7h16M4 12h16M4 17h16" />}>
      {(close) => {
        const done = () => { setSub('root'); close() }
        if (sub === 'templates') return <>{back}{TEMPLATES.map((t) => <button key={t.id} className="menu-item" onClick={() => { s.loadTemplate(t.id); done() }}><b>{t.title}</b><span>{t.blurb}</span></button>)}</>
        if (sub === 'challenges') return <>{back}{CHALLENGES.map((c) => (
          <div key={c.id} className="menu-row">
            <button className="menu-item" onClick={() => { s.startChallenge(c.id); done() }}><b>{c.title} <em className={`diff d-${c.difficulty}`}>{c.difficulty}</em>{s.passed[c.id] && <em className="passed-tag">passed</em>}</b></button>
            <button className="tbtn small" onClick={() => { s.startGuide(c.id); done() }}>Solution</button>
          </div>
        ))}</>
        if (sub === 'file') return <>{back}
          <button className="menu-item" onClick={() => { s.shareLink(); done() }}><b>Copy share link</b></button>
          <button className="menu-item" onClick={() => { downloadDesignDoc(); done() }}><b>Download design doc</b></button>
          <button className="menu-item" onClick={() => { exportBoardPng(); done() }}><b>Save board as image</b></button>
          <button className="menu-item" onClick={() => { s.exportJson(); done() }}><b>Export JSON</b></button>
          <button className="menu-item" onClick={() => { onImport(); done() }}><b>Import JSON</b></button>
        </>
        return (
          <>
            <button className="menu-item nav" onClick={() => setSub('templates')}><b>Templates</b></button>
            <button className="menu-item nav" onClick={() => setSub('challenges')}><b>Challenges</b><span>{CHALLENGES.filter((c) => s.passed[c.id]).length} of {CHALLENGES.length} passed</span></button>
            <button className="menu-item nav" onClick={() => setSub('file')}><b>File</b><span>Share, export, import</span></button>
            <div className="menu-sep" />
            <div className="menu-inline">
              <button className="tbtn small" onClick={s.undo} disabled={!s.past.length}>Undo</button>
              <button className="tbtn small" onClick={s.redo} disabled={!s.future.length}>Redo</button>
              <button className="tbtn small" onClick={s.toggleTheme}>{s.theme === 'light' ? 'Night mode' : 'Day mode'}</button>
              <button className="tbtn small" onClick={() => { s.setHelp(true); done() }}>Help</button>
            </div>
            <label className="menu-field">
              <span>Cloud names</span>
              <select value={s.provider} onChange={(e) => s.setProvider(e.target.value as Provider)}>
                {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
            <label className="menu-field">
              <span>Speed</span>
              <select value={s.speed} onChange={(e) => s.setSpeed(Number(e.target.value))}>
                {SPEEDS.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}
              </select>
            </label>
          </>
        )
      }}
    </Menu>
  )
}

export function HelpModal() {
  const open = useApp((s) => s.helpOpen)
  const setHelp = useApp((s) => s.setHelp)
  const dlg = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = dlg.current
    if (!d) return
    if (open && !d.open) d.showModal()
    else if (!open && d.open) d.close()
  }, [open])
  useEffect(() => {
    const d = dlg.current
    if (!d) return
    const onClose = () => {
      d.returnValue = ''
      setHelp(false)
    }
    let pressedOutside = false
    const outside = (e: PointerEvent) => {
      const r = d.getBoundingClientRect()
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom
    }
    const onDown = (e: PointerEvent) => { pressedOutside = outside(e) }
    const onUp = (e: PointerEvent) => {
      if (!('closedBy' in HTMLDialogElement.prototype) && pressedOutside && outside(e) && d.open) d.close()
      pressedOutside = false
    }
    d.addEventListener('close', onClose)
    d.addEventListener('pointerdown', onDown)
    d.addEventListener('pointerup', onUp)
    return () => {
      d.removeEventListener('close', onClose)
      d.removeEventListener('pointerdown', onDown)
      d.removeEventListener('pointerup', onUp)
    }
  }, [setHelp])

  return (
    <dialog ref={dlg} className="modal-dlg" aria-labelledby="help-title" {...({ closedby: 'any' } as Record<string, string>)}>
      <div className="modal">
        <div className="modal-head">
          <h1 id="help-title">Welcome to ArchSim</h1>
          <button type="button" className="iconbtn" onClick={() => setHelp(false)} aria-label="Close help">✕</button>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>A whiteboard for system design that actually runs. Sketch an architecture, then watch real-ish traffic, latency, failures and cost flow through it.</p>
        <ol>
          <li><b>Build.</b> Drag components from the left onto the board. Draw a connection from the blue dot on a component's right edge.</li>
          <li><b>Tune.</b> Click anything. Change regions, instance sizes, replicas, cache hit rate, users, read/write mix, traffic pattern.</li>
          <li><b>Route.</b> Click a connection. <i>Split</i> shares load between siblings and skips dead ones; <i>Every request</i> means a call made on every request. A connection can carry only reads or only writes.</li>
          <li><b>Watch.</b> The clock runs through a day. Traffic rises and falls, autoscaling reacts, queues fill and drain. The Model view shows it as a 3D table model.</li>
          <li><b>Break it.</b> In the Chaos tab, take components down, lose a zone or a whole region, cut links, add delay, multiply traffic, or empty every cache. Turn on retries for a connection to see a retry storm, then add a circuit breaker to stop it.</li>
          <li><b>Improve.</b> The Advisor points out single points of failure, overloaded parts, slow cross-region calls and retry storms. The Cost tab finds reserved, spot and ARM savings. Most come with a one-click fix.</li>
          <li><b>Practise.</b> {CHALLENGES.length} classic interview problems, from a URL shortener to Uber, Ticketmaster, payments, IoT telemetry, collaborative apps, and an LLM assistant. Try them yourself, or open <i>See the solution</i> to walk through how a good design comes together, one step at a time.</li>
          <li><b>Pick your cloud.</b> Switch AWS / Google Cloud / Azure in the top bar to see the matching product names.</li>
        </ol>
        <h2 className="subh">Shortcuts</h2>
        <div className="keys">
          <span><kbd>Space</kbd> play / pause</span>
          <span><kbd>Del</kbd> delete selection</span>
          <span><kbd>Ctrl</kbd>+<kbd>Z</kbd> undo</span>
          <span><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> redo</span>
          <span><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> <kbd>4</kbd> board, both, model, map</span>
          <span><kbd>Esc</kbd> deselect</span>
          <span><kbd>Ctrl</kbd>+<kbd>K</kbd> add a component</span>
          <span><kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>V</kbd> / <kbd>D</kbd> copy, paste, duplicate</span>
          <span><kbd>F</kbd> fit board / model</span>
          <span><kbd>[</kbd> / <kbd>]</kbd> / <kbd>\</kbd> toggle panels</span>
          <span><kbd>Shift</kbd>+drag select several</span>
        </div>
        <p className="muted small">The numbers are teaching approximations based on queueing theory, distances between cities and list prices. The right-hand panel explains how each one is worked out.</p>
        <button type="button" className="btn btn-accent" onClick={() => setHelp(false)}>Start building</button>
      </div>
    </dialog>
  )
}
