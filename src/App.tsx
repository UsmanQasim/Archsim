import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { initFromUrlOrStorage, useApp } from './store'
import { startSimLoop } from './simLoop'
import { Topbar, HelpModal } from './ui/Topbar'
import { Palette } from './ui/Palette'
import { FlowCanvas } from './ui/FlowCanvas'
import { Inspector } from './ui/Inspector'
import { Dock, MetricsStrip } from './ui/Dock'
import { QuickAdd } from './ui/QuickAdd'
import { ProblemBank, ResultView, SubmitDialog } from './ui/Bank'
import { getLayout, useDrawer, useLayout } from './layout'

// the 3D model (three.js) and the world map are loaded only when first shown
const Scene3D = lazy(() => import('./ui/Scene3D').then((m) => ({ default: m.Scene3D })))
const MapView = lazy(() => import('./ui/MapView').then((m) => ({ default: m.MapView })))

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const s = useApp.getState()
      const mod = e.ctrlKey || e.metaKey
      const key = e.key.toLowerCase()
      if (mod && key === 'k') {
        e.preventDefault()
        s.setQuickAdd(true)
        return
      }
      if (s.quickAddOpen || s.helpOpen) return
      if (mod && key === 'c') {
        s.copySelection()
        return
      }
      if (mod && key === 'v') {
        e.preventDefault()
        s.paste()
        return
      }
      if (mod && key === 'd') {
        e.preventDefault()
        s.copySelection()
        s.paste()
        return
      }
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) s.redo()
        else s.undo()
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        s.redo()
      } else if (e.code === 'Space') {
        e.preventDefault()
        s.togglePlay()
      } else if (e.key === 'Escape') {
        s.select(null)
        s.setHelp(false)
      } else if (!mod && (e.key === '1' || e.key === '2' || e.key === '3' || e.key === '4')) {
        s.setView(e.key === '1' ? '2d' : e.key === '2' ? 'split' : e.key === '3' ? '3d' : 'map')
      } else if (!mod && key === 'f') {
        s.triggerFit()
      } else if (!mod && e.key === '[') {
        if (getLayout() === 'wide') s.togglePalette()
        else useDrawer.getState().toggle('palette')
      } else if (!mod && e.key === ']') {
        if (getLayout() === 'wide') s.toggleInspector()
        else useDrawer.getState().toggle('inspector')
      } else if (!mod && e.key === '\\') {
        s.toggleDock()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && (s.view === '3d' || s.view === 'map') && s.selection) {
        if (s.selection.type === 'node') s.removeNode(s.selection.id)
        else s.removeEdge(s.selection.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function useDockHeight() {
  const [h, setH] = useState(() => {
    try {
      const v = Number(localStorage.getItem('archsim:dock-h'))
      if (v >= 180 && v <= 700) return v
    } catch {
      /* ignore */
    }
    if (getLayout() === 'narrow') return Math.round(window.innerHeight * 0.36)
    return window.innerHeight < 820 ? 260 : 320
  })
  const drag = useRef<{ y: number; h: number } | null>(null)
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!drag.current) return
      const next = Math.max(180, Math.min(window.innerHeight - 260, drag.current.h + (drag.current.y - e.clientY)))
      setH(next)
    }
    const up = () => {
      if (!drag.current) return
      drag.current = null
      document.body.classList.remove('resizing')
      setH((v) => {
        try {
          localStorage.setItem('archsim:dock-h', String(Math.round(v)))
        } catch {
          /* ignore */
        }
        return v
      })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])
  const start = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, h }
    document.body.classList.add('resizing')
  }
  return { h, start, setH }
}

export default function App() {
  const view = useApp((s) => s.view)
  const toast = useApp((s) => s.toast)
  const theme = useApp((s) => s.theme)
  const paletteOpen = useApp((s) => s.paletteOpen)
  const inspectorOpen = useApp((s) => s.inspectorOpen)
  const dockOpen = useApp((s) => s.dockOpen)
  const togglePalette = useApp((s) => s.togglePalette)
  const toggleInspector = useApp((s) => s.toggleInspector)
  const dock = useDockHeight()
  const layout = useLayout()
  const wide = layout === 'wide'
  const drawer = useDrawer((s) => s.drawer)
  const openDrawer = useDrawer((s) => s.open)
  // on small screens the side panels slide in: open details when something is picked
  useEffect(
    () =>
      useApp.subscribe((s, prev) => {
        if (s.selection === prev.selection || getLayout() === 'wide') return
        if (s.selection) openDrawer('inspector')
        else if (useDrawer.getState().drawer === 'inspector') openDrawer(null)
      }),
    [openDrawer],
  )
  useEffect(() => {
    if (layout === 'wide') openDrawer(null)
    // side-by-side board and model needs a big screen
    else if (useApp.getState().view === 'split') useApp.getState().setView('2d')
  }, [layout, openDrawer])
  useEffect(() => {
    if (layout !== 'wide' && view === 'split') useApp.getState().setView('2d')
  }, [layout, view])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  useShortcuts()
  useEffect(() => {
    initFromUrlOrStorage()
    try {
      if (!localStorage.getItem('archsim:seen-help')) {
        useApp.getState().setHelp(true)
        localStorage.setItem('archsim:seen-help', '1')
      }
    } catch {
      /* ignore */
    }
    // start simulating once the first frame is on screen, so the page paints sooner
    let stop: (() => void) | undefined
    const ric = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1))
    const id = ric(() => (stop = startSimLoop()), { timeout: 400 })
    return () => {
      ;(window.cancelIdleCallback ?? window.clearTimeout)(id)
      stop?.()
    }
  }, [])

  const bottomH = dockOpen ? dock.h : 66

  return (
    <ReactFlowProvider>
      <div
        className={`app layout-${layout} ${drawer ? `drawer-${drawer}` : ''}`}
        style={{
          gridTemplateRows: 'auto minmax(0, 1fr) var(--dock-h)',
          ['--dock-h' as string]: `${bottomH}px`,
          ['--pal-w' as string]: !wide || paletteOpen ? undefined : '0px',
          ['--insp-w' as string]: !wide || inspectorOpen ? undefined : '0px',
        }}
      >
        <Topbar />
        <div className="main">
          {!wide || paletteOpen ? <Palette /> : <div aria-hidden="true" />}
          <main className={`stage view-${view}`}>
            {wide && !paletteOpen && (
              <button type="button" className="panel-reopen left" onClick={togglePalette} title="Show components ([)" aria-label="Show components panel">
                Components →
              </button>
            )}
            {wide && !inspectorOpen && (
              <button type="button" className="panel-reopen right" onClick={toggleInspector} title="Show inspector (])" aria-label="Show inspector panel">
                ← Inspector
              </button>
            )}
            {(view === '2d' || view === 'split') && (
              <div className="pane pane-2d">
                <FlowCanvas />
              </div>
            )}
            {view === 'map' && (
              <div className="pane pane-map">
                <Suspense fallback={<div className="pane-loading">Loading the map…</div>}>
                  <MapView />
                </Suspense>
              </div>
            )}
            {(view === '3d' || view === 'split') && (
              <div className="pane pane-3d">
                <Suspense fallback={<div className="pane-loading">Loading the 3D model…</div>}>
                  <Scene3D />
                </Suspense>
              </div>
            )}
          </main>
          {!wide || inspectorOpen ? <Inspector /> : <div aria-hidden="true" />}
          {!wide && drawer && <div className="scrim" onClick={() => openDrawer(null)} aria-hidden />}
        </div>
        <div className={`app-bottom ${dockOpen ? '' : 'is-collapsed'}`}>
          {dockOpen && (
            <div
              className="dock-resizer"
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize bottom panel"
              aria-valuenow={Math.round(dock.h)}
              aria-valuemin={180}
              aria-valuemax={Math.max(180, window.innerHeight - 260)}
              tabIndex={0}
              onPointerDown={dock.start}
              onDoubleClick={() => dock.setH(dock.h > 320 ? 280 : 440)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp') dock.setH(Math.min(window.innerHeight - 260, dock.h + 24))
                if (e.key === 'ArrowDown') dock.setH(Math.max(180, dock.h - 24))
              }}
            />
          )}
          <MetricsStrip />
          <Dock />
        </div>
        <HelpModal />
        <ProblemBank />
        <SubmitDialog />
        <ResultView />
        <QuickAdd />
        <div className="toast-region" role="status" aria-live="polite" aria-atomic="true">
          {toast && <div className="toast">{toast}</div>}
        </div>
      </div>
    </ReactFlowProvider>
  )
}
