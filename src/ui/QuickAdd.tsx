import { useEffect, useRef, useState } from 'react'
import { useReactFlow } from '@xyflow/react'
import { CATALOG, KIND_ORDER } from '../sim/catalog'
import { useApp } from '../store'
import { KindIcon } from './Icon'

/** Ctrl+K: type a few letters, press Enter, the component lands in the middle of the board. */
export function QuickAdd() {
  const open = useApp((s) => s.quickAddOpen)
  const setOpen = useApp((s) => s.setQuickAdd)
  const addNode = useApp((s) => s.addNode)
  const provider = useApp((s) => s.provider)
  const { screenToFlowPosition } = useReactFlow()
  const [q, setQ] = useState('')
  const [i, setI] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const dlg = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const d = dlg.current
    if (!d) return
    if (open) {
      setQ('')
      setI(0)
      if (!d.open) d.showModal()
      setTimeout(() => input.current?.focus(), 0)
    } else if (d.open) {
      d.close()
    }
  }, [open])

  useEffect(() => {
    const d = dlg.current
    if (!d) return
    const onClose = () => {
      d.returnValue = ''
      setOpen(false)
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
  }, [setOpen])

  const query = q.trim().toLowerCase()
  const list = KIND_ORDER.map((k) => CATALOG[k]).filter((d) => !query || `${d.label} ${Object.values(d.providers).join(' ')} ${d.category} ${d.desc}`.toLowerCase().includes(query))
  const pick = (idx: number) => {
    const d = list[idx]
    if (!d) return
    const pane = document.querySelector('.pane-2d')?.getBoundingClientRect()
    let pos: { x: number; y: number } | undefined
    if (pane) {
      const p = screenToFlowPosition({ x: pane.left + pane.width / 2, y: pane.top + pane.height / 2 })
      pos = { x: p.x - 98 + (Math.random() - 0.5) * 60, y: p.y - 45 + (Math.random() - 0.5) * 60 }
    }
    addNode(d.kind, pos)
    setOpen(false)
  }

  return (
    <dialog ref={dlg} className="qa-dlg" aria-label="Add a component" {...({ closedby: 'any' } as Record<string, string>)}>
      <input
        ref={input}
        className="qa-input"
        value={q}
        placeholder="Add a component… (try “redis”, “queue”, “Cloud Run”)"
        onChange={(e) => {
          setQ(e.target.value)
          setI(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setI(Math.min(list.length - 1, i + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setI(Math.max(0, i - 1))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            pick(i)
          }
        }}
        aria-label="Search components"
      />
      <ul className="qa-list" role="listbox">
        {list.map((d, idx) => (
          <li key={d.kind} role="option" aria-selected={idx === i}>
            <button type="button" className={idx === i ? 'on' : ''} onMouseEnter={() => setI(idx)} onClick={() => pick(idx)} style={{ ['--accent' as string]: d.color }}>
              <span className="tile"><KindIcon kind={d.kind} size={16} /></span>
              <span className="qa-text"><b>{d.label}</b><span>{d.providers[provider]}</span></span>
              <span className="qa-cat">{d.category}</span>
            </button>
          </li>
        ))}
        {!list.length && <li className="muted small" style={{ padding: 12 }}>Nothing matches “{q}”.</li>}
      </ul>
      <div className="qa-foot">
        <span><kbd>↑</kbd><kbd>↓</kbd> navigate · <kbd>Enter</kbd> add · <kbd>Esc</kbd> close</span>
        <span>{list.length} component{list.length === 1 ? '' : 's'}</span>
      </div>
    </dialog>
  )
}
