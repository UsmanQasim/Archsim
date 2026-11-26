import { memo } from 'react'
import { NodeResizer, type NodeProps } from '@xyflow/react'
import { useApp, type NNode, type NoteColor } from '../store'

const COLORS: { id: NoteColor; label: string }[] = [
  { id: 'yellow', label: 'Yellow' },
  { id: 'pink', label: 'Pink' },
  { id: 'blue', label: 'Blue' },
  { id: 'green', label: 'Green' },
]

/** A sticky note for the whiteboard. Not part of the simulation. */
function NoteNodeView({ id, data, selected }: NodeProps<NNode>) {
  const updateNote = useApp((s) => s.updateNote)
  return (
    <div className={`note note-${data.color} ${selected ? 'is-sel' : ''}`}>
      <NodeResizer isVisible={selected} minWidth={140} minHeight={90} lineClassName="note-resize-line" handleClassName="note-resize-handle" />
      <textarea
        className="note-text nodrag nowheel"
        value={data.text}
        placeholder="Write a note: an assumption, a trade-off, a question to ask…"
        onChange={(e) => updateNote(id, { text: e.target.value })}
        aria-label="Sticky note"
      />
      {selected && (
        <div className="note-colors nodrag">
          {COLORS.map((c) => (
            <button key={c.id} className={`swatch note-${c.id} ${data.color === c.id ? 'on' : ''}`} onClick={() => updateNote(id, { color: c.id })} aria-label={`${c.label} note`} title={c.label} />
          ))}
        </div>
      )}
    </div>
  )
}

export const NoteNode = memo(NoteNodeView)
