import { CATALOG, SIZES } from './sim/catalog'
import { findChallenge } from './sim/scenarios'
import { locationName } from './sim/engine'
import { fmtMoney, fmtMs, fmtNum, fmtPct } from './format'
import { useApp, useSim } from './store'
import { PHASES } from './practice'

/** Write the current design up as a Markdown design document. */
export function buildDesignDoc(): string {
  const s = useApp.getState()
  const sim = useSim.getState()
  const res = sim.result
  const prov = s.provider
  const byId = new Map(s.nodes.map((n) => [n.id, n]))
  const L: string[] = []
  L.push(`# ${s.title}`, '')
  L.push(`_System design exported from ArchSim on ${new Date().toLocaleDateString()}. Product names shown for ${prov === 'aws' ? 'AWS' : prov === 'gcp' ? 'Google Cloud' : 'Azure'}._`, '')
  const ch = findChallenge(s.challengeId)
  if (ch) L.push(`**Problem:** ${ch.title}. ${ch.brief}`, '')

  const iv = s.interview
  const ivNotes = iv ? PHASES.filter((p) => iv.notes[p.id]?.trim()) : []
  if (ivNotes.length) {
    L.push('## My notes', '')
    ivNotes.forEach((p) => L.push(`### ${p.title}`, '', iv!.notes[p.id].trim(), ''))
  }
  const sticky = s.notes.filter((n) => n.data.text.trim())
  if (sticky.length) {
    L.push('## Notes on the board', '')
    sticky.forEach((n) => L.push(`- ${n.data.text.trim().replace(/\n+/g, ' ')}`))
    L.push('')
  }

  const clients = s.nodes.filter((n) => n.data.kind === 'client')
  if (clients.length) {
    L.push('## Users and traffic', '')
    L.push('| Who | Where | Active users | Peak req/s | Reads | Response size | Pattern |', '|---|---|---|---|---|---|---|')
    clients.forEach((c) => {
      const cfg = c.data.config
      L.push(`| ${c.data.label} | ${locationName(cfg.region)} | ${fmtNum(cfg.users)} | ${fmtNum((cfg.users * cfg.reqPerUserMin) / 60)} | ${Math.round(cfg.readRatio * 100)} % | ${cfg.payloadKB} KB | ${cfg.pattern} |`)
    })
    L.push('')
  }

  L.push('## Components', '')
  L.push('| Component | Service | Where | Sizing | Notes |', '|---|---|---|---|---|')
  s.nodes.filter((n) => n.data.kind !== 'client').forEach((n) => {
    const def = CATALOG[n.data.kind]
    const c = n.data.config
    const sizing: string[] = []
    if (def.scalable && n.data.kind !== 'sql') sizing.push(`${c.autoscale ? `${c.minInstances}–${c.maxInstances}` : c.instances} × ${SIZES[c.size].label.split(' · ')[1] ?? c.size}${c.autoscale ? ', autoscaling' : ''}`)
    if (n.data.kind === 'sql') sizing.push(`${c.shards} shard(s), ${c.replicas} replica(s), ${SIZES[c.size].label.split(' · ')[1]}${c.multiAz ? ', Multi-AZ' : ''}`)
    if (n.data.kind === 'cache' || n.data.kind === 'cdn' || n.data.kind === 'edgefn') sizing.push(`${Math.round(c.hitRate * 100)} % hit rate`)
    if (n.data.kind === 'nosql' || n.data.kind === 'stream' || n.data.kind === 'globaldb') sizing.push(`${c.shards} partitions/shards`)
    if (def.pricingLevers && c.pricing !== 'ondemand') sizing.push(c.pricing)
    if (def.armCapable && c.arch === 'arm') sizing.push('ARM')
    const m = res?.nodes[n.id]
    const notes = m ? `${fmtNum(m.inRead + m.inWrite)} req/s${m.capacity < 1e8 ? `, ${fmtPct(m.util, 0)} busy` : ''}` : ''
    L.push(`| ${n.data.label} | ${def.providers[prov]} | ${locationName(c.region)} | ${sizing.join(', ') || '—'} | ${notes} |`)
  })
  L.push('')

  if (s.edges.length) {
    L.push('## Request flow', '')
    s.edges.forEach((e) => {
      const a = byId.get(e.source)
      const b = byId.get(e.target)
      if (!a || !b) return
      const d = e.data
      const bits = [d?.mode === 'all' ? 'called on every request' : 'load shared', d?.filter === 'read' ? 'reads only' : d?.filter === 'write' ? 'writes only' : '', d?.retries ? `${d.retries} retries` : '', d?.breaker ? 'circuit breaker' : ''].filter(Boolean)
      L.push(`- **${a.data.label}** → **${b.data.label}** (${bits.join(', ')})`)
    })
    L.push('')
  }

  if (res) {
    const T = res.totals
    L.push('## How it performs (at the simulated time of export)', '')
    L.push(`- Throughput: ${fmtNum(T.offered)} req/s, ${fmtPct(T.availability, 3)} succeed`)
    L.push(`- Latency: ${fmtMs(T.avgLatency)} average, ${fmtMs(T.p99)} p99 at the slowest location`)
    L.push(`- Cost: ${fmtMoney(T.monthlyCost)} per month (${fmtMoney(T.egressCost)} data transfer), ${fmtMoney(T.costPerMillion)} per million requests`)
    const b = byId.get(T.bottleneckId ?? '')
    if (b) L.push(`- Busiest component: ${b.data.label} at ${fmtPct(T.bottleneckUtil, 0)}`)
    L.push('')
  }
  if (s.limitReport) {
    const r = s.limitReport
    L.push('## Headroom', '')
    L.push(r.breakAt === null ? '- Survived 20× the daily peak in the breaking-point test.' : `- Holds ${fmtNum(r.safeRps)} req/s; breaks at ×${r.breakAt}, where ${byId.get(r.breakerId ?? '')?.data.label ?? 'the system'} gives out first.`, '')
  }
  if (s.dayReport) {
    const d = s.dayReport
    L.push('## 24-hour test', '', `- ${fmtPct(d.dayAvailability, 3)} of the day's requests succeeded; worst minute ${fmtPct(d.minAvailability, 2)}`, `- p99 over the day ${fmtMs(d.dayP99)}; average cost ${fmtMoney(d.avgMonthlyCost)} per month`, '')
  }
  const open = sim.advice.filter((a) => !a.cost)
  const cost = sim.advice.filter((a) => a.cost)
  if (open.length || cost.length) {
    L.push('## Open issues and trade-offs', '')
    open.forEach((a) => L.push(`- **${a.title}.** ${a.detail}`))
    cost.forEach((a) => L.push(`- **${a.title}**${a.saving ? ` (saves about ${fmtMoney(a.saving)}/month)` : ''}. ${a.detail}`))
    L.push('')
  }
  return L.join('\n')
}

export function downloadDesignDoc() {
  const md = buildDesignDoc()
  const title = useApp.getState().title
  const blob = new Blob([md], { type: 'text/markdown' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${title.replace(/[^\w-]+/g, '-').toLowerCase() || 'design'}.md`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export function copyDesignDoc() {
  const md = buildDesignDoc()
  navigator.clipboard?.writeText(md).then(
    () => useApp.getState().showToast('Design doc copied as Markdown'),
    () => useApp.getState().showToast('Copy was blocked by the browser; use Download instead'),
  )
}
