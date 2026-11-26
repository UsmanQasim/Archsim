import { useEffect, useRef, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { initFromUrlOrStorage, useApp } from './store'
import { startSimLoop } from './simLoop'
import { Topbar, HelpModal } from './ui/Topbar'
import { Palette } from './ui/Palette'
import { FlowCanvas } from './ui/FlowCanvas'
import { Scene3D } from './ui/Scene3D'
import { Inspector } from './ui/Inspector'
import { Dock, MetricsStrip } from './ui/Dock'
import { QuickAdd } from './ui/QuickAdd'
import { MapView } from './ui/MapView'

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
        s.togglePalette()
      } else if (!mod && e.key === ']') {
        s.toggleInspector()
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
    return startSimLoop()
  }, [])
  useEffect(() => {
    const compact = window.matchMedia('(max-width: 900px)')
    const closeSidebarsOnCompact = () => {
      if (!compact.matches) return
      const state = useApp.getState()
      if (state.paletteOpen) state.togglePalette()
      if (state.inspectorOpen) state.toggleInspector()
    }
    closeSidebarsOnCompact()
    compact.addEventListener('change', closeSidebarsOnCompact)
    return () => compact.removeEventListener('change', closeSidebarsOnCompact)
  }, [])

  const bottomH = dockOpen ? dock.h : 66

  return (
    <ReactFlowProvider>
      <div
        className="app"
        style={{
          gridTemplateRows: 'auto minmax(0, 1fr) var(--dock-h)',
          ['--dock-h' as string]: `${bottomH}px`,
          ['--pal-w' as string]: paletteOpen ? undefined : '0px',
          ['--insp-w' as string]: inspectorOpen ? undefined : '0px',
        }}
      >
        <Topbar />
        <div className="main">
          {paletteOpen ? <Palette /> : <div aria-hidden="true" />}
          <main className={`stage view-${view}`}>
            {!paletteOpen && (
              <button type="button" className="panel-reopen left" onClick={togglePalette} title="Show components ([)" aria-label="Show components panel">
                Components →
              </button>
            )}
            {!inspectorOpen && (
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
                <MapView />
              </div>
            )}
            {(view === '3d' || view === 'split') && (
              <div className="pane pane-3d">
                <Scene3D />
              </div>
            )}
          </main>
          {inspectorOpen ? <Inspector /> : <div aria-hidden="true" />}
        </div>
        <div className={`app-bottom ${dockOpen ? '' : 'is-collapsed'}`}>
          {dockOpen && (
            <div
              className="dock-resizer"
              role="separator"
              aria-orientation="horizontal"
              aria-label="Resize bottom panel"
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
        <QuickAdd />
        <div className="toast-region" role="status" aria-live="polite" aria-atomic="true">
          {toast && <div className="toast">{toast}</div>}
        </div>
      </div>
    </ReactFlowProvider>
  )
}
