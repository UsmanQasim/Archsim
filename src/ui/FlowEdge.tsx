import { memo } from 'react'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react'
import { fmtMs, fmtNum } from '../format'
import { useApp, useSim, type SEdge } from '../store'

function FlowEdgeView({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected }: EdgeProps<SEdge>) {
  const em = useSim((s) => s.result?.edges[id])
  const cut = useApp((s) => s.chaos.cutEdges.includes(id))
  const delay = useApp((s) => s.chaos.edgeDelay[id] ?? 0)
  const select = useApp((s) => s.select)
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  const rps = em?.rps ?? 0
  const err = em?.errRate ?? 0
  const cls = cut ? 'e-bad' : em?.back ? 'e-back' : err > 0.05 ? 'e-bad' : err > 0.001 ? 'e-warn' : rps > 0 ? 'e-ok' : 'e-idle'
  const width = 1.4 + Math.min(4, Math.log10(rps + 1) * 0.8)
  const dur = rps > 0 ? Math.max(0.35, 2.2 - Math.log10(rps + 1) * 0.4) : 0
  const tags: string[] = []
  if (data?.filter === 'read') tags.push('reads')
  if (data?.filter === 'write') tags.push('writes')
  if (data?.mode === 'all') tags.push('every call')
  if (data && data.mode !== 'all' && data.weight !== 1) tags.push(`weight ${data.weight}`)
  if (data?.retries) tags.push(`${data.retries} retr${data.retries > 1 ? 'ies' : 'y'}`)
  if (data?.breaker) tags.push('breaker')

  return (
    <g className={cls}>
      <BaseEdge id={id} path={path} style={{ stroke: 'var(--stroke)', strokeWidth: selected ? width + 1.5 : width, opacity: rps > 0 || cut ? 0.55 : 0.8, strokeDasharray: cut ? '6 6' : undefined, strokeLinecap: 'round' }} interactionWidth={18} />
      {rps > 0 && !cut && (
        <path d={path} className="edge-flow" style={{ animationDuration: `${dur}s` }} fill="none" />
      )}
      <EdgeLabelRenderer>
        <div
          className={`elabel nodrag nopan ${cls} ${selected ? 'is-sel' : ''} ${cut ? 'is-cut' : ''}`}
          style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
          onClick={(e) => {
            e.stopPropagation()
            select({ type: 'edge', id })
          }}
        >
          {cut ? 'Link cut' : (
            <>
              <span>{fmtNum(rps)}/s</span>
              {(em?.latencyMs ?? 0) > 3 && <span className="elabel-lat">{fmtMs(em!.latencyMs)}</span>}
              {delay > 0 && <span className="elabel-bad">+{delay}ms</span>}
              {tags.map((t) => <span key={t} className="elabel-tag">{t}</span>)}
            </>
          )}
        </div>
      </EdgeLabelRenderer>
    </g>
  )
}

export const FlowEdge = memo(FlowEdgeView)
