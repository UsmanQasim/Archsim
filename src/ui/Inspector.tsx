import { useMemo, useState } from 'react'
import { CATALOG, FIELD_META, PROVIDERS, SIZES, fieldLabel, visibleFields, type FieldKey } from '../sim/catalog'
import { ASSUMPTIONS } from '../sim/engine'
import { GLOBAL, LOCATIONS, cloudRegions, rttMs } from '../sim/regions'
import type { NodeConfig, SizeKey } from '../sim/types'
import { fmtMoney, fmtMs, fmtNum, fmtPct, utilColor } from '../format'
import { useDrawer } from '../layout'
import { useApp, useSim, type SEdge, type SNode } from '../store'
import { KindIcon } from './Icon'
import { traceTree } from '../sim/analysis'

export function Inspector() {
  const sel = useApp((s) => s.selection)
  const node = useApp((s) => (sel?.type === 'node' ? s.nodes.find((n) => n.id === sel.id) : undefined))
  const edge = useApp((s) => (sel?.type === 'edge' ? s.edges.find((e) => e.id === sel.id) : undefined))
  return (
    <aside className="inspector">
      <button className="drawer-close" onClick={() => useDrawer.getState().open(null)} aria-label="Close details">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
      {node ? <NodeInspector key={node.id} n={node} /> : edge ? <EdgeInspector key={edge.id} e={edge} /> : <Overview />}
    </aside>
  )
}

// ---------------------------------------------------------------- overview
function Overview() {
  const nodes = useApp((s) => s.nodes)
  const select = useApp((s) => s.select)
  const toggleInspector = useApp((s) => s.toggleInspector)
  const res = useSim((s) => s.result)
  const [showModel, setShowModel] = useState(false)
  if (!res) return null
  const T = res.totals
  const costRows = nodes
    .filter((n) => n.data.kind !== 'client')
    .map((n) => ({ n, c: res.nodes[n.id]?.cost ?? 0 }))
    .sort((a, b) => b.c - a.c)
  const hotRows = nodes
    .filter((n) => n.data.kind !== 'client')
    .map((n) => ({ n, m: res.nodes[n.id] }))
    .filter((x) => x.m && (x.m.inRead + x.m.inWrite > 0.01 || !x.m.healthy))
    .sort((a, b) => (!a.m.healthy ? -1 : !b.m.healthy ? 1 : b.m.util - a.m.util))
    .slice(0, 6)
  const maxC = Math.max(costRows[0]?.c ?? 0, T.egressCost) || 1
  const clients = nodes.filter((n) => n.data.kind === 'client')
  return (
    <div className="insp">
      <div className="insp-top">
        <div className="panel-title">Your system</div>
        <button type="button" className="iconbtn" onClick={toggleInspector} title="Hide inspector (])" aria-label="Hide inspector panel">»</button>
      </div>
      <p className="muted small">Click any component or connection on the board to tune it. Numbers update as you change things.</p>

      {clients.length > 0 && (
        <section>
          <h4>How it feels to users</h4>
          <table className="tbl">
            <thead><tr><th>Where</th><th>Req/s</th><th>Avg</th><th>p99</th><th>OK</th></tr></thead>
            <tbody>
              {clients.map((c) => {
                const m = res.nodes[c.id]
                return (
                  <tr key={c.id} onClick={() => select({ type: 'node', id: c.id })} className="clickable">
                    <td className="ellip" title={c.data.label}>{c.data.label.replace(/^Users · /, '')}</td>
                    <td>{fmtNum(m?.offered ?? 0)}</td>
                    <td>{fmtMs(m?.e2eLatency ?? 0)}</td>
                    <td className={(m?.e2eP99 ?? 0) > 500 ? 'bad' : ''}>{fmtMs(m?.e2eP99 ?? 0)}</td>
                    <td className={(m?.success ?? 1) < 0.999 ? 'bad' : 'ok'}>{fmtPct(m?.success ?? 1, 2)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}

      {hotRows.length > 0 && (
        <section>
          <h4>Component health</h4>
          <table className="tbl">
            <thead><tr><th>Component</th><th>Load</th><th>Busy</th><th>Latency</th></tr></thead>
            <tbody>
              {hotRows.map(({ n, m }) => (
                <tr key={n.id} onClick={() => select({ type: 'node', id: n.id })} className="clickable">
                  <td className="ellip" title={n.data.label}>{n.data.label}</td>
                  <td>{fmtNum(m.inRead + m.inWrite)}/s</td>
                  <td className={!m.healthy || m.util > 1 ? 'bad' : m.util >= 0.85 ? 'warn-t' : 'ok'}>
                    {!m.healthy ? 'Down' : fmtPct(m.util, 0)}
                  </td>
                  <td>{m.healthy ? fmtMs(m.latency) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section>
        <h4>Monthly cost · {fmtMoney(T.monthlyCost)}</h4>
        <p className="muted small">At the current request rate, projected to a month. {T.egressCost > 0 && <>Data transfer = bytes sent to users and between regions.</>} {T.costPerMillion > 0 && <>≈ {fmtMoney(T.costPerMillion)} per million successful requests.</>}</p>
        <div className="costlist">
          {T.egressCost > 0 && (
            <div className="costrow">
              <span className="ellip">Data transfer</span>
              <span className="costbar"><span style={{ width: `${(T.egressCost / maxC) * 100}%`, background: '#94a3b8' }} /></span>
              <b>{fmtMoney(T.egressCost)}</b>
            </div>
          )}
          {costRows.slice(0, 12).map(({ n, c }) => (
            <button key={n.id} className="costrow" onClick={() => select({ type: 'node', id: n.id })}>
              <span className="ellip">{n.data.label}</span>
              <span className="costbar"><span style={{ width: `${(c / maxC) * 100}%`, background: CATALOG[n.data.kind].color }} /></span>
              <b>{fmtMoney(c)}</b>
            </button>
          ))}
          {!costRows.length && <div className="muted small">Nothing deployed yet.</div>}
        </div>
      </section>

      <section>
        <button className="linkbtn" onClick={() => setShowModel(!showModel)}>{showModel ? 'Hide' : 'How the numbers are worked out'}</button>
        {showModel && (
          <ul className="assume">
            {ASSUMPTIONS.map((a) => <li key={a}>{a}</li>)}
          </ul>
        )}
      </section>
    </div>
  )
}

// ---------------------------------------------------------------- node
function NodeInspector({ n }: { n: SNode }) {
  const m = useSim((s) => s.result?.nodes[n.id])
  const updateConfig = useApp((s) => s.updateConfig)
  const rename = useApp((s) => s.rename)
  const removeNode = useApp((s) => s.removeNode)
  const duplicate = useApp((s) => s.duplicate)
  const toggleNodeFail = useApp((s) => s.toggleNodeFail)
  const flushCache = useApp((s) => s.flushCache)
  const failed = useApp((s) => s.chaos.failedNodes.includes(n.id))
  const select = useApp((s) => s.select)
  const provider = useApp((s) => s.provider)
  const def = CATALOG[n.data.kind]
  const cfg = n.data.config
  const locked = !!n.data.locked
  const isClient = n.data.kind === 'client'
  const load = m ? m.inRead + m.inWrite : 0
  const set = (patch: Partial<NodeConfig>) => updateConfig(n.id, patch)

  return (
    <div className="insp">
      <div className="insp-head" style={{ ['--accent' as string]: def.color }}>
        <span className="tile big"><KindIcon kind={n.data.kind} size={22} /></span>
        <div className="grow">
          <input className="name-input" value={n.data.label} disabled={locked} onChange={(e) => rename(n.id, e.target.value)} aria-label="Component name" />
          <div className="muted small">{isClient ? 'Users' : <span className="prov">{def.providers[provider]}</span>}{locked && <>, set by the challenge</>}</div>
        </div>
        <button className="iconbtn" onClick={() => select(null)} title="Close" aria-label="Close inspector">✕</button>
      </div>
      <p className="muted small">{def.desc}</p>

      {m && (
        <div className="kpis">
          {isClient ? (
            <>
              <Kpi k="Sending" v={`${fmtNum(m.offered ?? 0)}/s`} />
              <Kpi k="Success" v={fmtPct(m.success, 2)} bad={m.success < 0.999} />
              <Kpi k="Avg latency" v={fmtMs(m.e2eLatency ?? 0)} />
              <Kpi k="p99 latency" v={fmtMs(m.e2eP99 ?? 0)} bad={(m.e2eP99 ?? 0) > 500} />
            </>
          ) : (
            <>
              <Kpi k="Incoming" v={`${fmtNum(load)}/s`} sub={load > 0 ? `${fmtPct(m.inRead / load, 0)} reads` : undefined} />
              <Kpi k="Busy" v={fmtPct(m.util, 0)} color={utilColor(m.util, load < 0.01)} sub={m.capacity < 1e8 ? `of ${fmtNum(m.capacity)}/s capacity` : 'managed, scales itself'} />
              <Kpi k="Service time" v={fmtMs(m.latency)} sub={`p99 ${fmtMs(m.p99)}`} />
              <Kpi k="Monthly" v={fmtMoney(m.cost + m.egressCost)} sub={m.egressCost > 0 ? `${fmtMoney(m.egressCost)} egress` : undefined} />
              {(m.droppedRps > 0.5 || m.throttledRps > 0.5) && <Kpi k={m.throttledRps > 0 ? 'Throttled' : 'Dropped'} v={`${fmtNum(m.droppedRps + m.throttledRps)}/s`} bad />}
              {def.async && <Kpi k="Backlog" v={fmtNum(m.backlog ?? 0)} sub={Number.isFinite(m.backlogAgeSec ?? 0) ? `${Math.round(m.backlogAgeSec ?? 0)} s behind` : 'no consumers'} bad={(m.backlogAgeSec ?? 0) > 60} />}
              {def.autoscalable && cfg.autoscale && <Kpi k="Running now" v={`${m.instances}`} sub={`of ${cfg.minInstances}–${cfg.maxInstances}`} />}
              {(m.retryAmp ?? 1) > 1.05 && <Kpi k="Retry load" v={`×${m.retryAmp!.toFixed(2)}`} sub="extra load from retries" bad />}
              {m.azDegraded && <Kpi k="Zone outage" v="degraded" sub="lost one AZ" bad />}
              <Kpi k="End-to-end ok" v={fmtPct(m.success, 2)} bad={m.success < 0.999} />
            </>
          )}
        </div>
      )}

      <section>
        <h4>Configuration</h4>
        {visibleFields(n.data.kind, cfg).map((f) => (
          <Field key={f} f={f} n={n} disabled={locked} onChange={set} />
        ))}
      </section>

      {isClient && <TimeBreakdown id={n.id} />}
      <Learn kind={n.data.kind} />

      <section>
        <h4>Try breaking it</h4>
        <div className="btnrow">
          {!isClient && (
            <button className={`btn ${failed ? 'btn-danger-on' : 'btn-danger'}`} onClick={() => toggleNodeFail(n.id)}>
              {failed ? 'Bring it back' : 'Take it down'}
            </button>
          )}
          {(n.data.kind === 'cache' || n.data.kind === 'cdn') && <button className="btn" onClick={() => flushCache(n.id)}>Flush cache</button>}
          {def.scalable && !isClient && n.data.kind !== 'sql' && (
            <button className="btn" disabled={locked} onClick={() => set({ instances: Math.max(1, cfg.instances * 2), maxInstances: Math.max(cfg.maxInstances, cfg.instances * 2) })}>×2 instances</button>
          )}
          {isClient && !locked && <button className="btn" onClick={() => set({ users: Math.round(cfg.users * 2) })}>×2 users</button>}
        </div>
      </section>

      <div className="btnrow end">
        <button className="btn" onClick={() => duplicate(n.id)}>Duplicate</button>
        <button className="btn btn-ghost-danger" disabled={locked} onClick={() => removeNode(n.id)}>Delete</button>
      </div>
    </div>
  )
}

function TimeBreakdown({ id }: { id: string }) {
  const res = useSim((s) => s.result)
  const nodes = useApp((s) => s.nodes)
  const edges = useApp((s) => s.edges)
  const chaos = useApp((s) => s.chaos)
  const select = useApp((s) => s.select)
  const trace = useMemo(() => (res ? traceTree(nodes, edges, res, id, chaos) : null), [res, nodes, edges, id, chaos])
  if (!trace || trace.rows.length < 2) return null
  const rows = trace.rows.slice(1)
  const max = Math.max(...rows.map((r) => r.contribution), 0.001)
  const top = rows.reduce((a, b) => (b.contribution > a.contribution ? b : a))
  const network = rows.reduce((s, r) => s + r.reach * r.hopMs, 0)
  return (
    <section>
      <h4>Where the time goes</h4>
      <p className="muted small" style={{ marginTop: 0 }}>
        An average request takes {fmtMs(trace.total)}. {fmtPct(network / Math.max(0.001, trace.total), 0)} of that is network travel; the biggest single share is <b>{top.label}</b>.
      </p>
      <ul className="trace">
        {rows.map((r, i) => (
          <li key={`${r.id}-${i}`} style={{ paddingLeft: (r.depth - 1) * 12 }}>
            <button className="trace-name" onClick={() => select({ type: 'node', id: r.id })} title={r.note}>
              <span className="tile tiny" style={{ ['--accent' as string]: CATALOG[r.kind].color }}><KindIcon kind={r.kind} size={12} /></span>
              <span className="ellip">{r.label}</span>
            </button>
            <span className="trace-bar"><span style={{ width: `${(r.contribution / max) * 100}%` }} /></span>
            <span className="trace-ms">{fmtMs(r.contribution)}</span>
            <span className="trace-sub">
              {r.reach < 0.995 ? `${fmtPct(r.reach, 0)} of requests, ` : ''}
              {r.hopMs > 0.6 ? `${fmtMs(r.hopMs)} to get there, ` : ''}
              {fmtMs(r.ownMs)} inside{r.note ? `. ${r.note[0].toUpperCase()}${r.note.slice(1)}` : ''}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Learn({ kind }: { kind: SNode['data']['kind'] }) {
  const def = CATALOG[kind]
  const [open, setOpen] = useState(true)
  return (
    <section className="learn">
      <button className="linkbtn h4btn" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'How to use it well' : 'How to use it well (show)'}</button>
      {open && (
        <>
          <p><b>When:</b> {def.when}</p>
          <p><b>Trade-offs:</b> {def.tradeoffs}</p>
          {kind !== 'client' && (
            <div className="provgrid">
              {PROVIDERS.map((p) => (
                <div key={p.id}><span>{p.label}</span><b>{def.providers[p.id]}</b></div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  )
}

function Kpi({ k, v, sub, bad, color }: { k: string; v: string; sub?: string; bad?: boolean; color?: string }) {
  return (
    <div className={`kpi ${bad ? 'bad' : ''}`}>
      <div className="kpi-k">{k}</div>
      <div className="kpi-v" style={color ? { color } : undefined}>{v}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}

function Field({ f, n, disabled, onChange }: { f: FieldKey; n: SNode; disabled: boolean; onChange: (p: Partial<NodeConfig>) => void }) {
  const meta = FIELD_META[f]
  const cfg = n.data.config
  const label = fieldLabel(n.data.kind, f)
  const v = cfg[f]
  const isClient = n.data.kind === 'client'
  let control: JSX.Element
  switch (meta.type) {
    case 'region': {
      if (cfg.region === GLOBAL) {
        control = <div className="muted small">Global: runs at edge locations worldwide</div>
        break
      }
      const opts = isClient ? LOCATIONS : cloudRegions
      control = (
        <select value={cfg.region} disabled={disabled} onChange={(e) => onChange({ region: e.target.value })}>
          {isClient && <optgroup label="Cities">{LOCATIONS.filter((l) => !l.cloud).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>}
          <optgroup label="Cloud regions">{opts.filter((l) => l.cloud).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
        </select>
      )
      break
    }
    case 'select':
      control = (
        <select value={String(v)} disabled={disabled} onChange={(e) => onChange({ [f]: e.target.value } as Partial<NodeConfig>)}>
          {meta.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )
      break
    case 'toggle':
      control = (
        <label className="switch">
          <input type="checkbox" checked={!!v} disabled={disabled} onChange={(e) => onChange({ [f]: e.target.checked } as Partial<NodeConfig>)} />
          <span />
        </label>
      )
      break
    case 'slider':
      control = (
        <div className="slider">
          <input type="range" min={meta.min} max={meta.max} step={meta.step} value={Number(v)} disabled={disabled} onChange={(e) => onChange({ [f]: Number(e.target.value) } as Partial<NodeConfig>)} />
          <span className="slider-v">{meta.percent ? fmtPct(Number(v), 0) : Number(v)}</span>
        </div>
      )
      break
    default:
      control = (
        <div className="numfield">
          <input
            type="number"
            min={meta.min}
            max={meta.max}
            step={meta.step}
            value={Number(v)}
            disabled={disabled}
            onChange={(e) => {
              const x = Number(e.target.value)
              if (Number.isFinite(x)) onChange({ [f]: Math.max(meta.min ?? -Infinity, Math.min(meta.max ?? Infinity, x)) } as Partial<NodeConfig>)
            }}
          />
          {meta.unit && <span className="unit">{meta.unit}</span>}
        </div>
      )
  }
  const extra = f === 'size' ? `${fmtMoney(SIZES[cfg.size as SizeKey].hourly * 730)}/mo each` : f === 'users' ? `${fmtNum((cfg.users * cfg.reqPerUserMin) / 60)} req/s at peak` : undefined
  return (
    <div className={`field field-${meta.type}`}>
      <label title={meta.help}>
        {label}
        {meta.help && <span className="help" title={meta.help}>?</span>}
      </label>
      {control}
      {extra && <div className="field-extra">{extra}</div>}
    </div>
  )
}

// ---------------------------------------------------------------- edge
function EdgeInspector({ e }: { e: SEdge }) {
  const em = useSim((s) => s.result?.edges[e.id])
  const src = useApp((s) => s.nodes.find((n) => n.id === e.source))
  const tgt = useApp((s) => s.nodes.find((n) => n.id === e.target))
  const updateEdge = useApp((s) => s.updateEdge)
  const removeEdge = useApp((s) => s.removeEdge)
  const toggleEdgeCut = useApp((s) => s.toggleEdgeCut)
  const setEdgeDelay = useApp((s) => s.setEdgeDelay)
  const select = useApp((s) => s.select)
  const cut = useApp((s) => s.chaos.cutEdges.includes(e.id))
  const delay = useApp((s) => s.chaos.edgeDelay[e.id] ?? 0)
  const d = e.data!
  if (!src || !tgt) return null
  const sr = src.data.config.region
  const tr = tgt.data.config.region
  const cross = sr !== GLOBAL && tr !== GLOBAL && sr !== tr
  return (
    <div className="insp">
      <div className="insp-head">
        <div className="grow">
          <div className="edge-title"><b>{src.data.label}</b> → <b>{tgt.data.label}</b></div>
          <div className="muted small">{cross ? `Crosses regions: ${Math.round(rttMs(sr, tr))} ms round trip` : 'Connection'}</div>
        </div>
        <button className="iconbtn" onClick={() => select(null)} aria-label="Close inspector">✕</button>
      </div>
      {em && (
        <div className="kpis">
          <Kpi k="Traffic" v={`${fmtNum(em.rps)}/s`} />
          <Kpi k="Network" v={fmtMs(em.latencyMs)} />
          <Kpi k="Errors" v={fmtPct(em.errRate, 2)} bad={em.errRate > 0.001} />
          {em.back && <Kpi k="Ignored" v="cycle" bad />}
        </div>
      )}
      <section>
        <h4>How traffic flows</h4>
        <div className="field">
          <label>Mode</label>
          <div className="seg">
            <button className={d.mode === 'split' ? 'on' : ''} onClick={() => updateEdge(e.id, { mode: 'split' })}>Split</button>
            <button className={d.mode === 'all' ? 'on' : ''} onClick={() => updateEdge(e.id, { mode: 'all' })}>Every request</button>
          </div>
          <div className="field-extra">{d.mode === 'split' ? 'Load is shared with sibling "split" connections by weight; failed targets are skipped (failover).' : 'Every request also calls this target, in sequence. If it fails, the request fails.'}</div>
        </div>
        <div className="field">
          <label>Carries</label>
          <div className="seg">
            {(['any', 'read', 'write'] as const).map((x) => (
              <button key={x} className={d.filter === x ? 'on' : ''} onClick={() => updateEdge(e.id, { filter: x })}>{x === 'any' ? 'All traffic' : x === 'read' ? 'Reads' : 'Writes'}</button>
            ))}
          </div>
        </div>
        {d.mode === 'split' && (
          <div className="field">
            <label>Weight</label>
            <div className="numfield">
              <input type="number" min={0} max={100} step={1} value={d.weight} onChange={(ev) => updateEdge(e.id, { weight: Math.max(0, Number(ev.target.value) || 0) })} />
            </div>
          </div>
        )}
      </section>
      <section>
        <h4>When calls fail</h4>
        <div className="field">
          <label title="Callers retry failed requests. Helps with blips, multiplies load during overload.">Retries</label>
          <div className="seg">
            {[0, 1, 2, 3].map((r) => (
              <button key={r} className={(d.retries ?? 0) === r ? 'on' : ''} onClick={() => updateEdge(e.id, { retries: r })}>{r}</button>
            ))}
          </div>
        </div>
        <div className="field">
          <label title="Stop calling a target that is failing more than half the time; fail fast instead.">Circuit breaker</label>
          <label className="switch">
            <input type="checkbox" checked={!!d.breaker} onChange={(ev) => updateEdge(e.id, { breaker: ev.target.checked })} />
            <span />
          </label>
          <div className="field-extra">{d.retries ? 'Use idempotency keys so a retried call is never applied twice. Add backoff + jitter in real code.' : 'No retries: a transient error fails the request.'}</div>
        </div>
      </section>
      <section>
        <h4>Try breaking it</h4>
        <div className="btnrow">
          <button className={`btn ${cut ? 'btn-danger-on' : 'btn-danger'}`} onClick={() => toggleEdgeCut(e.id)}>{cut ? 'Reconnect' : 'Cut this link'}</button>
        </div>
        <div className="field">
          <label>Injected latency</label>
          <div className="slider">
            <input type="range" min={0} max={1000} step={10} value={delay} onChange={(ev) => setEdgeDelay(e.id, Number(ev.target.value))} />
            <span className="slider-v">{delay} ms</span>
          </div>
        </div>
      </section>
      <div className="btnrow end">
        <button className="btn btn-ghost-danger" onClick={() => removeEdge(e.id)}>Delete connection</button>
      </div>
    </div>
  )
}
