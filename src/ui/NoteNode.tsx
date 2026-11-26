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
  const removeNote = useApp((s) => s.removeNote)
  return (
    <div className={`note note-${data.color} ${selected ? 'is-sel' : ''}`}>
      <NodeResizer isVisible={selected} minWidth={140} minHeight={90} lineClassName="note-resize-line" handleClassName="note-resize-handle" />
      {/* the textarea takes typing, so the strip on top is what you drag */}
      <div className="note-grip" title="Drag to move the note">
        <svg width="18" height="6" viewBox="0 0 18 6" aria-hidden>
          {[1, 5, 9, 13, 17].map((x) => <circle key={x} cx={x} cy="1.5" r="1.1" />)}
          {[3, 7, 11, 15].map((x) => <circle key={x} cx={x} cy="4.5" r="1.1" />)}
        </svg>
      </div>
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
            <button type="button" key={c.id} className={`swatch note-${c.id} ${data.color === c.id ? 'on' : ''}`} onClick={() => updateNote(id, { color: c.id })} aria-label={`${c.label} note`} title={c.label} />
          ))}
          <button type="button" className="note-del" onClick={() => removeNote(id)} aria-label="Delete note">Delete</button>
        </div>
      )}
    </div>
  )
}

export const NoteNode = memo(NoteNodeView)
