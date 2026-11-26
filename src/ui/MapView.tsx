import { useMemo, useState } from 'react'
import { feature } from 'topojson-client'
import type { Topology, GeometryCollection } from 'topojson-specification'
import type { MultiPolygon, Polygon, Position } from 'geojson'
import land110 from 'world-atlas/land-110m.json'
import { CATALOG } from '../sim/catalog'
import { GLOBAL, LOCATIONS, getLocation, rttMs } from '../sim/regions'
import { traceTree } from '../sim/analysis'
import { fmtMs, fmtNum, fmtPct } from '../format'
import { useApp, useSim, type SNode } from '../store'
import { KindIcon } from './Icon'

// Equirectangular projection, cropped to the inhabited latitudes.
const W = 1000
const LAT_TOP = 78
const LAT_BOT = -58
const H = Math.round((W * (LAT_TOP - LAT_BOT)) / 360)
const px = (lon: number) => ((lon + 180) / 360) * W
const py = (lat: number) => ((LAT_TOP - lat) / (LAT_TOP - LAT_BOT)) * H

function ringPath(ring: Position[]): { d: string; minLon: number; maxLon: number } {
  // unwrap longitudes so a ring that crosses the antimeridian stays continuous
  let prev = ring[0][0]
  let minLon = prev
  let maxLon = prev
  const pts = ring.map(([lon, lat], i) => {
    let l = lon
    if (i > 0) {
      while (l - prev > 180) l -= 360
      while (prev - l > 180) l += 360
    }
    prev = l
    minLon = Math.min(minLon, l)
    maxLon = Math.max(maxLon, l)
    return `${px(l).toFixed(1)},${py(lat).toFixed(1)}`
  })
  return { d: `M${pts.join('L')}Z`, minLon, maxLon }
}

const LAND = (() => {
  const topo = land110 as unknown as Topology<{ land: GeometryCollection }>
  const fc = feature(topo, topo.objects.land)
  const main: string[] = []
  const shifted: { dx: number; d: string }[] = []
  const geoms = 'features' in fc ? fc.features.map((f) => f.geometry) : [(fc as { geometry: Polygon | MultiPolygon }).geometry]
  for (const g of geoms) {
    if (!g) continue
    const polys = g.type === 'Polygon' ? [(g as Polygon).coordinates] : g.type === 'MultiPolygon' ? (g as MultiPolygon).coordinates : []
    for (const poly of polys) {
      for (const ring of poly) {
        if (ring.length < 4) continue
        const r = ringPath(ring)
        main.push(r.d)
        // copies so pieces that wrap past the date line show up on the other side
        if (r.maxLon > 180) shifted.push({ dx: -W, d: r.d })
        if (r.minLon < -180) shifted.push({ dx: W, d: r.d })
      }
    }
  }
  return { main, shifted }
})()
const LAND_D = LAND.main.join('')

function arc(x1: number, y1: number, x2: number, y2: number, bend = 0.18) {
  // take the short way round the world
  if (x2 - x1 > W / 2) x2 -= W
  else if (x1 - x2 > W / 2) x2 += W
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  // bend towards the pole, like a great-circle route looks on a flat map
  let nx = -dy / len
  let ny = dx / len
  if (ny > 0) {
    nx = -nx
    ny = -ny
  }
  const k = len * bend
  const cx = mx + nx * k
  const cy = my + ny * k
  return { d: `M${x1},${y1} Q${cx},${cy} ${x2},${y2}`, lx: (x1 + 2 * cx + x2) / 4, ly: (y1 + 2 * cy + y2) / 4 }
}

const successClass = (s: number) => (s >= 0.999 ? 'ok' : s >= 0.98 ? 'warn' : 'bad')

export function MapView() {
  const nodes = useApp((s) => s.nodes)
  const edges = useApp((s) => s.edges)
  const chaos = useApp((s) => s.chaos)
  const select = useApp((s) => s.select)
  const selection = useApp((s) => s.selection)
  const toggleRegion = useApp((s) => s.toggleRegion)
  const toggleAZ = useApp((s) => s.toggleAZ)
  const playing = useApp((s) => s.playing)
  const res = useSim((s) => s.result)
  const [openRegion, setOpenRegion] = useState<string | null>(null)
  const [showIdle, setShowIdle] = useState(false)

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes])
  const clients = nodes.filter((n) => n.data.kind === 'client')
  const infra = nodes.filter((n) => n.data.kind !== 'client')
  const globals = infra.filter((n) => n.data.config.region === GLOBAL)

  const regions = useMemo(() => {
    const m = new Map<string, SNode[]>()
    infra.forEach((n) => {
      const r = n.data.config.region
      if (r === GLOBAL) return
      m.set(r, [...(m.get(r) ?? []), n])
    })
    return m
  }, [infra])

  // where each user group's requests first land
  const userRoutes = useMemo(() => {
    if (!res) return []
    const out: { client: SNode; region: string; share: number }[] = []
    for (const c of clients) {
      const { rows } = traceTree(nodes, edges, res, c.id, chaos)
      const share = new Map<string, number>()
      let best = Infinity
      rows.forEach((r) => {
        const n = byId.get(r.id)
        if (!n || n.data.kind === 'client' || n.data.config.region === GLOBAL) return
        best = Math.min(best, r.depth)
      })
      rows.forEach((r) => {
        const n = byId.get(r.id)
        if (!n || r.depth !== best || n.data.config.region === GLOBAL) return
        share.set(n.data.config.region, (share.get(n.data.config.region) ?? 0) + r.reach)
      })
      const tot = [...share.values()].reduce((a, b) => a + b, 0) || 1
      share.forEach((v, region) => out.push({ client: c, region, share: v / tot }))
    }
    return out
  }, [res, clients, nodes, edges, chaos, byId])

  // data moving between regions (replication, cross-region calls)
  const crossLinks = useMemo(() => {
    const m = new Map<string, { a: string; b: string; rps: number; healthy: boolean }>()
    edges.forEach((e) => {
      const s = byId.get(e.source)
      const t = byId.get(e.target)
      if (!s || !t || s.data.kind === 'client') return
      const a = s.data.config.region
      const b = t.data.config.region
      if (a === GLOBAL || b === GLOBAL || a === b) return
      const key = [a, b].sort().join('|')
      const em = res?.edges[e.id]
      const cur = m.get(key) ?? { a, b, rps: 0, healthy: true }
      cur.rps += em?.rps ?? 0
      cur.healthy = cur.healthy && (em?.healthy ?? true)
      m.set(key, cur)
    })
    return [...m.values()]
  }, [edges, byId, res])

  const maxRps = Math.max(1, ...clients.map((c) => res?.nodes[c.id]?.offered ?? 0))
  const regionStatus = (r: string) => {
    if (chaos.failedRegions.includes(r)) return 'down'
    const list = regions.get(r) ?? []
    if (list.some((n) => res && !res.nodes[n.id]?.healthy)) return 'warn'
    if ((chaos.failedAZs ?? []).includes(r)) return 'warn'
    if (list.some((n) => (res?.nodes[n.id]?.util ?? 0) > 0.85)) return 'warn'
    return 'ok'
  }
  const open = openRegion ? getLocation(openRegion) : null
  const openList = openRegion ? regions.get(openRegion) ?? [] : []

  return (
    <div className={`mapview ${playing ? 'playing' : ''}`}>
      <div className="map-head">
        <div className="map-legend small">
          <span><i className="lg-user" />Users, sized by traffic</span>
          <span><i className="lg-region" />Your regions</span>
          <span><i className="lg-route" />Where requests land</span>
          <span><i className="lg-cross" />Data between regions</span>
        </div>
        <label className="small map-toggle">
          <input type="checkbox" checked={showIdle} onChange={(e) => setShowIdle(e.target.checked)} /> Show unused regions
        </label>
      </div>
      <div className="map-wrap" onClick={() => setOpenRegion(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="map-svg" role="img" aria-label="World map of users, regions and traffic">
          <rect width={W} height={H} className="map-sea" />
          {[-30, 0, 30, 60].map((lat) => (
            <line key={lat} x1={0} x2={W} y1={py(lat)} y2={py(lat)} className="map-grat" />
          ))}
          {[-120, -60, 0, 60, 120].map((lon) => (
            <line key={lon} y1={0} y2={H} x1={px(lon)} x2={px(lon)} className="map-grat" />
          ))}
          <path d={LAND_D} className="map-land" />
          {LAND.shifted.map((s, i) => (
            <path key={i} d={s.d} transform={`translate(${s.dx} 0)`} className="map-land" />
          ))}

          {showIdle &&
            LOCATIONS.filter((l) => l.cloud && !regions.has(l.id)).map((l) => (
              <g key={l.id} transform={`translate(${px(l.lon)} ${py(l.lat)})`} className="map-idle">
                <circle r={3} />
                <text y={-6} textAnchor="middle">{l.short}</text>
              </g>
            ))}

          {crossLinks.map((c) => {
            const A = getLocation(c.a)
            const B = getLocation(c.b)
            if (!A || !B) return null
            const a = arc(px(A.lon), py(A.lat), px(B.lon), py(B.lat), 0.25)
            return (
              <g key={`${c.a}-${c.b}`}>
                <path d={a.d} className={`map-cross ${c.healthy ? '' : 'cut'}`} strokeWidth={1.2 + Math.min(3, Math.log10(1 + c.rps))} />
                <text x={a.lx} y={a.ly - 4} textAnchor="middle" className="map-lbl">{Math.round(rttMs(c.a, c.b))} ms</text>
              </g>
            )
          })}

          {userRoutes.map((u) => {
            const C = getLocation(u.client.data.config.region)
            const R = getLocation(u.region)
            if (!C || !R) return null
            const rps = (res?.nodes[u.client.id]?.offered ?? 0) * u.share
            const a = arc(px(C.lon), py(C.lat), px(R.lon), py(R.lat), 0.15)
            const down = chaos.failedRegions.includes(u.region)
            const same = C.id === R.id || rttMs(C.id, R.id) < 6
            return (
              <g key={`${u.client.id}-${u.region}`}>
                {!same && <path d={a.d} className={`map-route ${down ? 'cut' : ''}`} strokeWidth={1 + Math.min(4, Math.log10(1 + rps) * 1.1)} />}
                {!same && u.share > 0.15 && (
                  <text x={a.lx} y={a.ly - 4} textAnchor="middle" className="map-lbl">{Math.round(rttMs(C.id, R.id))} ms</text>
                )}
              </g>
            )
          })}

          {clients.map((c) => {
            const L = getLocation(c.data.config.region)
            if (!L) return null
            const m = res?.nodes[c.id]
            const rps = m?.offered ?? 0
            const r = 5 + 13 * Math.sqrt(rps / maxRps)
            const sel = selection?.type === 'node' && selection.id === c.id
            return (
              <g
                key={c.id}
                transform={`translate(${px(L.lon)} ${py(L.lat)})`}
                className={`map-user s-${successClass(m?.success ?? 1)} ${sel ? 'on' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  select({ type: 'node', id: c.id })
                }}
                role="button"
                tabIndex={0}
                aria-label={`${c.data.label} in ${L.name}`}
                onKeyDown={(e) => e.key === 'Enter' && select({ type: 'node', id: c.id })}
              >
                <circle r={r} />
                <text y={r + 12} textAnchor="middle" className="map-uname">{c.data.label}</text>
                <text y={r + 23} textAnchor="middle" className="map-ustat">
                  {fmtNum(rps)}/s, p99 {fmtMs(m?.e2eP99 ?? 0)}{m && m.success < 0.999 ? `, ${fmtPct(1 - m.success, 1)} fail` : ''}
                </text>
              </g>
            )
          })}
          {[...regions.entries()].map(([r, list]) => {
            const L = getLocation(r)
            if (!L) return null
            const st = regionStatus(r)
            return (
              <g
                key={r}
                transform={`translate(${px(L.lon)} ${py(L.lat)})`}
                className={`map-region st-${st} ${openRegion === r ? 'on' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  setOpenRegion(openRegion === r ? null : r)
                }}
                role="button"
                tabIndex={0}
                aria-label={`${L.name}: ${list.length} components`}
                onKeyDown={(e) => e.key === 'Enter' && setOpenRegion(r)}
              >
                <rect x={-13} y={-11} width={26} height={22} rx={6} />
                <text y={4.5} textAnchor="middle" className="map-count">{list.length}</text>
                <text y={-16} textAnchor="middle" className="map-rname">{L.short}</text>
              </g>
            )
          })}

        </svg>

        {globals.length > 0 && (
          <div className="map-global small">
            <b>Everywhere</b>
            {globals.map((g) => (
              <button key={g.id} className="map-gitem" onClick={(e) => { e.stopPropagation(); select({ type: 'node', id: g.id }) }}>
                <KindIcon kind={g.data.kind} size={14} />
                {g.data.label}
              </button>
            ))}
          </div>
        )}

        {nodes.length === 0 && <div className="map-empty">Add some users and components on the board, and they show up here on the map.</div>}

        {open && (
          <div
            className="map-pop"
            style={{ left: `${(px(open.lon) / W) * 100}%`, top: `${(py(open.lat) / H) * 100}%` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="map-pop-head">
              <b>{open.name}</b>
              <button className="linkbtn small" onClick={() => setOpenRegion(null)} aria-label="Close">Close</button>
            </div>
            <ul>
              {openList.map((n) => {
                const m = res?.nodes[n.id]
                return (
                  <li key={n.id}>
                    <button className="map-comp" onClick={() => select({ type: 'node', id: n.id })}>
                      <KindIcon kind={n.data.kind} size={14} />
                      <span className="ellip">{n.data.label}</span>
                      <span className={`small ${m && !m.healthy ? 'bad' : m && m.util > 0.85 ? 'warn-t' : 'muted'}`}>
                        {m ? (m.healthy ? `${fmtPct(m.util, 0)} busy` : 'down') : CATALOG[n.data.kind].label}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            <div className="btnrow">
              <button className={`btn small ${chaos.failedRegions.includes(open.id) ? 'btn-accent' : ''}`} onClick={() => toggleRegion(open.id)}>
                {chaos.failedRegions.includes(open.id) ? 'Bring region back' : 'Take region offline'}
              </button>
              <button className={`btn small ${(chaos.failedAZs ?? []).includes(open.id) ? 'btn-accent' : ''}`} onClick={() => toggleAZ(open.id)}>
                {(chaos.failedAZs ?? []).includes(open.id) ? 'Restore the zone' : 'Lose one zone'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
