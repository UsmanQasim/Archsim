import { useCallback, useEffect, useMemo, type DragEvent } from 'react'
import {
  Background, BackgroundVariant, Controls, MiniMap, Panel, ReactFlow, useReactFlow,
  type Connection, type Edge, type IsValidConnection, type NodeChange,
} from '@xyflow/react'
import { CATALOG } from '../sim/catalog'
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
  const { screenToFlowPosition, fitView } = useReactFlow()
  const view = useApp((s) => s.view)
  const theme = useApp((s) => s.theme)
  const title = useApp((s) => s.title)
  const count = useApp((s) => s.nodes.length)
  const fitTick = useApp((s) => s.fitTick)
  const tidyLayout = useApp((s) => s.tidyLayout)
  const setQuickAdd = useApp((s) => s.setQuickAdd)
  // re-frame smoothly when the pane resizes (view switch) or a different design loads
  useEffect(() => {
    const t = setTimeout(() => fitView({ padding: 0.2, maxZoom: 1, duration: 350 }), 60)
    return () => clearTimeout(t)
  }, [view, title, count, fitTick, fitView])

  const isValidConnection: IsValidConnection<SEdge> = useCallback((c: Connection | Edge) => {
    if (c.source === c.target) return false
    if (c.source.startsWith('note-') || c.target.startsWith('note-')) return false
    const t = useApp.getState().nodes.find((n) => n.id === c.target)
    const s = useApp.getState().nodes.find((n) => n.id === c.source)
    if (!t || !s) return false
    if (t.data.kind === 'client') return false
    if (CATALOG[s.data.kind].terminal) return false
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
          <button className="btn small" onClick={() => setQuickAdd(true)} title="Search and add a component (Ctrl+K)">Add component <kbd>Ctrl K</kbd></button>
          <button className="btn small" onClick={() => {
            const pane = document.querySelector('.pane-2d')?.getBoundingClientRect()
            if (!pane) return addNote()
            const p = screenToFlowPosition({ x: pane.left + 80, y: pane.top + 80 })
            addNote({ x: p.x, y: p.y })
          }} title="Add a sticky note to the board">Add note</button>
          <button className="btn small" onClick={tidyLayout} disabled={!count} title="Line everything up left to right in the order requests flow">Tidy up</button>
        </Panel>
      </ReactFlow>
    </div>
  )
}
