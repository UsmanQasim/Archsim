import { useState } from 'react'
import { CATALOG, CATEGORIES, KIND_ORDER } from '../sim/catalog'
import { closeDrawerIfOverlay } from '../layout'
import { useApp } from '../store'
import { DND_MIME } from './FlowCanvas'
import { KindIcon } from './Icon'

export function Palette() {
  const addNode = useApp((s) => s.addNode)
  const provider = useApp((s) => s.provider)
  const togglePalette = useApp((s) => s.togglePalette)
  const [q, setQ] = useState('')
  const [closed, setClosed] = useState<Record<string, boolean>>({})
  const query = q.trim().toLowerCase()
  const items = KIND_ORDER.map((k) => CATALOG[k]).filter(
    (d) => !query || `${d.label} ${d.desc} ${Object.values(d.providers).join(' ')}`.toLowerCase().includes(query),
  )
  return (
    <aside className="palette" aria-label="Component palette">
      <div className="panel-head">
        <div className="panel-title">Components <span className="count">{KIND_ORDER.length}</span></div>
        <button type="button" className="iconbtn" onClick={togglePalette} title="Hide components ([)" aria-label="Hide components panel">«</button>
      </div>
      <search className="search-box">
        <input className="search" type="search" placeholder="Search, e.g. Lambda or Spanner" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search components" />
      </search>
      <div className="palette-scroll">
        {CATEGORIES.map((cat) => {
          const list = items.filter((d) => d.category === cat)
          if (!list.length) return null
          const isClosed = closed[cat] && !query
          return (
            <div key={cat} className="pal-group">
              <button className="pal-cat" onClick={() => setClosed({ ...closed, [cat]: !closed[cat] })} aria-expanded={!isClosed}>
                <span>{cat}</span>
                <span className="pal-n">{list.length}</span>
              </button>
              {!isClosed && list.map((d) => (
                <button
                  key={d.kind}
                  className="pal-item"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DND_MIME, d.kind)
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  onClick={() => { addNode(d.kind); closeDrawerIfOverlay() }}
                  title={`${d.desc}\n\nWhen: ${d.when}`}
                  style={{ ['--accent' as string]: d.color }}
                >
                  <span className="tile"><KindIcon kind={d.kind} /></span>
                  <span className="pal-text">
                    <span className="pal-label">{d.label}</span>
                    <span className="pal-desc">{d.providers[provider]}</span>
                  </span>
                </button>
              ))}
            </div>
          )
        })}
        {!items.length && <div className="muted small pad">Nothing matches “{q}”.</div>}
      </div>
      <div className="palette-foot">Drag a component onto the board, or click to add it. Draw a connection from the blue dot on its right.</div>
    </aside>
  )
}
