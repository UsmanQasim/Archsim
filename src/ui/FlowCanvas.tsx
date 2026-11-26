import { useCallback, useEffect, useMemo, type DragEvent } from 'react'
import {
  getNodesBounds, Background, BackgroundVariant, Controls, MiniMap, Panel, ReactFlow, useReactFlow,
  type Connection, type Edge, type IsValidConnection, type NodeChange,
} from '@xyflow/react'
import { CATALOG } from '../sim/catalog'
import { TEMPLATES } from '../sim/scenarios'
import type { NodeKind } from '../sim/types'
import { useApp, type NNode, type SEdge, type SNode } from '../store'
import { NoteNode } from './NoteNode'
import { FlowEdge } from './FlowEdge'
import { FlowNode } from './FlowNode'

const nodeTypes = { sim: FlowNode, note: NoteNode }
const edgeTypes = { sim: FlowEdge }
export const DND_MIME = 'application/x-archsim-kind'

export function FlowCanvas() {
  const simNodes = useApp((s) => s.nodes)
  const notes = useApp((s) => s.notes)
  const nodes = useMemo(() => [...notes, ...simNodes] as (SNode | NNode)[], [notes, simNodes])
  const addNote = useApp((s) => s.addNote)
  const edges = useApp((s) => s.edges)
  const onNodesChange = useApp((s) => s.onNodesChange)
  const onEdgesChange = useApp((s) => s.onEdgesChange)
  const onConnect = useApp((s) => s.onConnect)
  const select = useApp((s) => s.select)
  const addNode = useApp((s) => s.addNode)
  const checkpoint = useApp((s) => s.checkpoint)
  const { screenToFlowPosition, fitView, setViewport, getNodes } = useReactFlow()
  const view = useApp((s) => s.view)
  const theme = useApp((s) => s.theme)
  const count = useApp((s) => s.nodes.length)
  const fitTick = useApp((s) => s.fitTick)
  const triggerFit = useApp((s) => s.triggerFit)
  const tidyLayout = useApp((s) => s.tidyLayout)
  const setQuickAdd = useApp((s) => s.setQuickAdd)
  const loadTemplate = useApp((s) => s.loadTemplate)
  // re-frame smoothly when the pane resizes (view switch) or a design loads/tidies
  useEffect(() => {
    const t = setTimeout(() => {
      const pane = document.querySelector('.pane-2d')?.getBoundingClientRect()
      const all = getNodes()
      if (!pane || !all.length) return fitView({ padding: 0.2, maxZoom: 1, duration: 350 })
      const b = getNodesBounds(all)
      const fit = Math.min(1, (pane.width * 0.86) / Math.max(1, b.width), (pane.height * 0.8) / Math.max(1, b.height))
      // too small to read: keep the text legible and start at the users on the left instead
      const readable = pane.width < 700 ? 0.5 : 0.6
      if (fit >= readable) return fitView({ padding: 0.2, maxZoom: 1, duration: 350 })
      const z = Math.min(readable, Math.max(fit, (pane.height * 0.8) / Math.max(1, b.height)))
      setViewport({ x: -b.x * z + 24, y: pane.height / 2 - (b.y + b.height / 2) * z, zoom: z }, { duration: 350 })
    }, 60)
    return () => clearTimeout(t)
  }, [view, fitTick, fitView, setViewport, getNodes])

  const isValidConnection: IsValidConnection<SEdge> = useCallback((c: Connection | Edge) => {
    if (c.source === c.target) return false
    if (c.source.startsWith('note-') || c.target.startsWith('note-')) return false
    const t = useApp.getState().nodes.find((n) => n.id === c.target)
    const s = useApp.getState().nodes.find((n) => n.id === c.source)
    if (!t || !s) return false
    if (t.data.kind === 'client') return false
    if (CATALOG[s.data.kind].terminal) return false
    const reachable = (from: string, goal: string, seen = new Set<string>()): boolean => {
      if (from === goal) return true
      if (seen.has(from)) return false
      seen.add(from)
      return useApp.getState().edges.some((e) => e.source === from && reachable(e.target, goal, seen))
    }
    if (reachable(c.target, c.source)) return false
    return true
  }, [])

  const onDrop = useCallback((e: DragEvent) => {
    e.preventDefault()
    const kind = e.dataTransfer.getData(DND_MIME) as NodeKind
    if (!kind || !CATALOG[kind]) return
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    addNode(kind, { x: p.x - 95, y: p.y - 40 })
  }, [screenToFlowPosition, addNode])

  return (
    <div className="flow-wrap" onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }} onDrop={onDrop}>
      <ReactFlow<SNode | NNode, SEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={(c: NodeChange<SNode | NNode>[]) => onNodesChange(c as NodeChange<SNode>[])}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={(_, n) => (n.type === 'note' ? select(null) : select({ type: 'node', id: n.id }))}
        onEdgeClick={(_, e) => select({ type: 'edge', id: e.id })}
        onPaneClick={() => select(null)}
        onNodeDragStart={() => checkpoint('drag')}
        isValidConnection={isValidConnection}
        defaultEdgeOptions={{ type: 'sim' }}
        connectionLineStyle={{ stroke: 'var(--blue)', strokeWidth: 2.2 }}
        deleteKeyCode={['Delete', 'Backspace']}
        snapToGrid
        snapGrid={[10, 10]}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.15}
        maxZoom={2}
        colorMode={theme}
      >
        <Background id="dots" variant={BackgroundVariant.Dots} gap={22} size={1.6} color={theme === 'dark' ? '#3a4045' : '#cdd5d1'} />
        <MiniMap style={{ width: 150, height: 96 }} pannable zoomable nodeColor={(n) => (n.type === 'note' ? '#e8d77a' : CATALOG[(n as SNode).data.kind]?.color ?? '#888')} nodeBorderRadius={4} maskColor={theme === 'dark' ? 'rgba(20,22,25,0.6)' : 'rgba(246,247,245,0.7)'} />
        <Controls showInteractive={false} />
        <Panel position="top-left" className="board-tools">
          <button className="btn small" onClick={() => setQuickAdd(true)} title="Search and add a component (Ctrl+K)"><span className="hide-narrow-inline">Add component</span><span className="only-narrow-inline">Add</span> <kbd>Ctrl K</kbd></button>
          <button className="btn small" onClick={() => {
            const pane = document.querySelector('.pane-2d')?.getBoundingClientRect()
            if (!pane) return addNote()
            const p = screenToFlowPosition({ x: pane.left + 80, y: pane.top + 80 })
            addNote({ x: p.x, y: p.y })
          }} title="Add a sticky note to the board">Add note</button>
          <button type="button" className="btn small" onClick={tidyLayout} disabled={!count} title="Line everything up left to right in the order requests flow">Tidy up</button>
          <button type="button" className="btn small" onClick={triggerFit} disabled={!count} title="Fit everything in view (F)">Fit</button>
        </Panel>
        {!count && !notes.length && (
          <Panel position="bottom-center" className="board-empty">
            <span className="board-empty-kicker">Start a design</span>
            <strong>Choose a working architecture</strong>
            <div className="board-empty-actions">
              {TEMPLATES.slice(1, 5).map((template) => (
                <button key={template.id} onClick={() => loadTemplate(template.id)}>
                  <span>{template.title.replace(/^\d+ · /, '')}</span>
                  <small>{template.blurb}</small>
                </button>
              ))}
              <button className="blank" onClick={() => setQuickAdd(true)}>
                <span>Build from scratch</span>
                <small>Search and add the first component</small>
              </button>
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  )
}
