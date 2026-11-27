import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { CATALOG, catVars } from '../sim/catalog'
import { regionShort } from '../sim/regions'
import { fmtMs, fmtNum, fmtPct, utilColor } from '../format'
import { useApp, useSim, type SNode } from '../store'
import { KindIcon } from './Icon'

const NO_UTIL = ['lb', 'gateway', 'waf', 'queue', 'pubsub', 'dns', 'cdn', 'edgefn', 'auth']

function FlowNodeView({ id, data, selected }: NodeProps<SNode>) {
  const m = useSim((s) => s.result?.nodes[id])
  const failed = useApp((s) => s.chaos.failedNodes.includes(id) || (data.config.region !== 'global' && data.kind !== 'client' && s.chaos.failedRegions.includes(data.config.region)))
  const provider = useApp((s) => s.provider)
  const sel = useApp((s) => s.selection)
  const linked = useApp((s) => {
    if (!sel || sel.type !== 'node') return 'none'
    if (sel.id === id) return 'self'
    return s.edges.some((e) => (e.source === sel.id && e.target === id) || (e.target === sel.id && e.source === id)) ? 'linked' : 'dim'
  })
  const def = CATALOG[data.kind]
  const isClient = data.kind === 'client'
  const load = m ? m.inRead + m.inWrite : 0
  const idle = !isClient && load < 0.01
  const u = m?.util ?? 0
  const showUtil = !isClient && !NO_UTIL.includes(data.kind)

  return (
    <div
      className={`fnode ${selected ? 'is-sel' : ''} ${linked === 'linked' ? 'is-linked' : ''} ${linked === 'dim' ? 'is-dim' : ''} ${failed ? 'is-failed' : ''} ${u > 1 && !failed ? 'is-hot' : ''}`}
      style={catVars(data.kind)}
    >
      {!isClient && <Handle type="target" position={Position.Left} className="port port-in" />}
      <div className="fnode-head">
        <span className="tile"><KindIcon kind={data.kind} size={17} /></span>
        <div className="fnode-titles">
          <span className="fnode-name" title={data.label}>{data.label}</span>
          <span className="fnode-prov">{isClient ? 'Users' : def.providers[provider]}</span>
        </div>
        <span className="fnode-region" title={data.config.region}>{regionShort(data.config.region)}</span>
      </div>
      <div className="fnode-body">
        {failed ? (
          <div className="fnode-down">● Down</div>
        ) : isClient ? (
          <>
            <Row k="Sending" v={`${fmtNum(m?.offered ?? 0)}/s`} />
            <Row k="Latency" v={m?.e2eLatency !== undefined ? fmtMs(m.e2eLatency) : '—'} />
            <Row k="Succeeding" v={m ? fmtPct(m.success, 2) : '—'} warn={m ? m.success < 0.999 : false} />
          </>
        ) : (
          <>
            <Row k="Incoming" v={`${fmtNum(load)}/s`} />
            {m && load > 0.01 && <Row k="Latency" v={fmtMs(m.latency)} warn={m.latency > 250} />}
            {showUtil && (
              <>
                <div className="ubar" title={`Utilisation ${fmtPct(u)}`}>
                  <div className="ubar-fill" style={{ width: `${Math.min(100, u * 100)}%`, background: utilColor(u, idle) }} />
                </div>
                <Row k="Busy" v={fmtPct(u, 0)} warn={u >= 0.85} />
              </>
            )}
            {u > 1 ? <span className="fnode-badge bad">▲ Overloaded</span> : u >= 0.85 ? <span className="fnode-badge warn">● High load</span> : null}
            {def.scalable && data.kind !== 'sql' && data.kind !== 'websocket' && (
              <Row k={data.kind === 'cache' || data.kind === 'search' ? 'Nodes' : 'Instances'} v={`${m?.instances ?? data.config.instances}${data.config.autoscale ? ' (auto)' : ''}`} />
            )}
            {data.kind === 'sql' && <Row k="Layout" v={`${data.config.shards} shard${data.config.shards > 1 ? 's' : ''}, ${1 + data.config.replicas} copies`} />}
            {(data.kind === 'cache' || data.kind === 'cdn' || data.kind === 'edgefn') && <Row k="Hit rate" v={fmtPct(m?.effectiveHit ?? data.config.hitRate, 0)} />}
            {def.async && m?.backlog !== undefined && <Row k="Waiting" v={fmtNum(m.backlog)} warn={(m.backlogAgeSec ?? 0) > 60} />}
            {data.kind === 'ratelimiter' && (m?.throttledRps ?? 0) > 0 && <Row k="Rejected" v={`${fmtNum(m!.throttledRps)}/s`} warn />}
            {(m?.droppedRps ?? 0) > 0.5 && <Row k="Dropped" v={`${fmtNum(m!.droppedRps)}/s`} warn />}
            {(m?.retryAmp ?? 1) > 1.05 && <Row k="Retry load" v={`×${m!.retryAmp!.toFixed(1)}`} warn />}
            {m?.azDegraded && <Row k="Zone" v="1 AZ down" warn />}
            {def.pricingLevers && (data.config.pricing !== 'ondemand' || data.config.arch === 'arm' || data.config.multiAz) && (
              <div className="ftags">
                {data.config.pricing === 'reserved' && <span>Reserved</span>}
                {data.config.pricing === 'spot' && <span>Spot</span>}
                {data.config.arch === 'arm' && <span>ARM</span>}
                {data.config.multiAz && <span>Multi-AZ</span>}
              </div>
            )}
          </>
        )}
      </div>
      {!def.terminal && <Handle type="source" position={Position.Right} className="port port-out" />}
    </div>
  )
}

function Row({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div className={`frow ${warn ? 'warn' : ''}`}>
      <span>{k}</span>
      <b>{v}</b>
    </div>
  )
}

export const FlowNode = memo(FlowNodeView)
