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
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.view === '3d' && s.selection) {
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

  return (
    <ReactFlowProvider>
      <div className="app" style={{ gridTemplateRows: `52px minmax(0, 1fr) ${dock.h}px` }}>
        <Topbar />
        <div className="main">
          <Palette />
          <div className={`stage view-${view}`}>
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
          </div>
          <Inspector />
        </div>
        <div className="app-bottom">
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
          <MetricsStrip />
          <Dock />
        </div>
        <HelpModal />
        <QuickAdd />
        {toast && <div className="toast" role="status">{toast}</div>}
        <div className="small-screen">ArchSim is built for a laptop or desktop screen (1280 px+). Rotate or widen your window for the full editor.</div>
      </div>
    </ReactFlowProvider>
  )
}
