import { create } from 'zustand'
import {
  addEdge, applyEdgeChanges, applyNodeChanges,
  type Connection, type Edge, type EdgeChange, type Node, type NodeChange,
} from '@xyflow/react'
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { Advice, Fix } from './sim/advisor'
import { CATALOG, defaultConfig } from './sim/catalog'
import { DEFAULT_EDGE, runDay, type DayReport } from './sim/engine'
import { findLimit, steadyState, type LimitReport } from './sim/analysis'
import { CHALLENGES, TEMPLATES, uid, type Graph } from './sim/scenarios'
import {
  emptyChaos, emptyRuntime, type Chaos, type NodeConfig, type NodeKind, type Provider, type Runtime, type SimEdgeData, type SimNodeData, type SimResult,
} from './sim/types'

export type SNode = Node<SimNodeData, 'sim'>
export type SEdge = Edge<SimEdgeData, 'sim'>
type Snap = { nodes: SNode[]; edges: SEdge[] }
export type View = '2d' | '3d' | 'split' | 'map'
export type NoteColor = 'yellow' | 'pink' | 'blue' | 'green'
export type NNode = Node<{ text: string; color: NoteColor; [k: string]: unknown }, 'note'>
export interface PassRecord { at: number; cost: number; p99: number }
export interface Interview { startedAt: number; minutes: number; notes: Record<string, string>; finishedAt: number | null; challengeId?: string | null }
export type Selection = { type: 'node' | 'edge'; id: string } | null
export type DockTab = 'advisor' | 'cost' | 'chaos' | 'tests' | 'compare' | 'estimate' | 'challenge' | 'practice'
export interface VariantMetrics { rps: number; p99: number; avgLatency: number; availability: number; cost: number; bottleneck: string; nodes: number }
export interface Variant { id: string; name: string; savedAt: number; nodes: SNode[]; edges: SEdge[]; metrics: VariantMetrics }
export interface Guide { challengeId: string; step: number }

export interface Sample {
  t: number
  rps: number
  avail: number
  lat: number
  p99: number
  cost: number
}

// ---------------- live simulation output (separate store: updates 10×/s) ----------------
interface SimState {
  result: SimResult | null
  runtime: Runtime
  history: Sample[]
  advice: Advice[]
}
export const useSim = create<SimState>(() => ({ result: null, runtime: emptyRuntime(), history: [], advice: [] }))

const resetRuntime = (ids?: string[]) => {
  const rt = useSim.getState().runtime
  if (!ids) {
    useSim.setState({ runtime: emptyRuntime(), history: [] })
    return
  }
  const next: Runtime = { instances: { ...rt.instances }, cooldown: { ...rt.cooldown }, backlog: { ...rt.backlog }, prevSuccess: { ...rt.prevSuccess } }
  ids.forEach((id) => {
    delete next.instances[id]
    delete next.cooldown[id]
  })
  useSim.setState({ runtime: next })
}

// ---------------- app state ----------------
interface AppState {
  title: string
  saveStatus: 'saved' | 'saving' | 'error'
  nodes: SNode[]
  edges: SEdge[]
  selection: Selection
  view: View
  playing: boolean
  speed: number
  time: number
  chaos: Chaos
  challengeId: string | null
  dayReport: DayReport | null
  limitReport: LimitReport | null
  limitRunning: boolean
  variants: Variant[]
  quickAddOpen: boolean
  fitTick: number
  notes: NNode[]
  passed: Record<string, PassRecord>
  interview: Interview | null
  dayRunning: boolean
  dockTab: DockTab
  past: Snap[]
  future: Snap[]
  toast: string | null
  helpOpen: boolean
  provider: Provider
  guide: Guide | null
  theme: 'light' | 'dark'
  toggleTheme: () => void
  paletteOpen: boolean
  inspectorOpen: boolean
  dockOpen: boolean
  togglePalette: () => void
  toggleInspector: () => void
  toggleDock: () => void
  triggerFit: () => void
  removeNote: (id: string) => void

  onNodesChange: (c: NodeChange<SNode>[]) => void
  onEdgesChange: (c: EdgeChange<SEdge>[]) => void
  onConnect: (c: Connection) => void
  checkpoint: (key?: string) => void
  undo: () => void
  redo: () => void

  addNode: (kind: NodeKind, pos?: { x: number; y: number }) => string
  updateConfig: (id: string, patch: Partial<NodeConfig>) => void
  rename: (id: string, label: string) => void
  updateEdge: (id: string, patch: Partial<SimEdgeData>) => void
  removeNode: (id: string) => void
  removeEdge: (id: string) => void
  duplicate: (id: string) => void
  select: (s: Selection) => void

  setView: (v: View) => void
  togglePlay: () => void
  setSpeed: (s: number) => void
  setTime: (t: number) => void
  setDockTab: (t: DockTab) => void
  setTitle: (t: string) => void

  loadGraph: (g: Graph, opts: { title: string; challengeId?: string | null; keepGuide?: boolean; keepDock?: boolean; notes?: NNode[] }) => void
  startGuide: (challengeId: string) => void
  guideTo: (step: number) => void
  exitGuide: () => void
  setProvider: (p: Provider) => void
  toggleAZ: (r: string) => void
  loadTemplate: (id: string) => void
  startChallenge: (id: string) => void

  toggleNodeFail: (id: string) => void
  toggleRegion: (r: string) => void
  toggleEdgeCut: (id: string) => void
  setEdgeDelay: (id: string, ms: number) => void
  setTrafficMult: (x: number) => void
  flushCache: (id: string) => void
  flushAllCaches: () => void
  clearChaos: () => void

  applyFix: (f: Fix) => void
  runDayTest: () => void
  runLimit: () => void
  saveVariant: (name: string) => void
  loadVariant: (id: string) => void
  deleteVariant: (id: string) => void
  copySelection: () => void
  paste: () => void
  tidyLayout: () => void
  setQuickAdd: (o: boolean) => void
  addNote: (pos?: { x: number; y: number }) => void
  updateNote: (id: string, patch: Partial<{ text: string; color: NoteColor }>) => void
  startInterview: (minutes: number) => void
  setInterviewNote: (phase: string, text: string) => void
  finishInterview: () => void
  clearInterview: () => void
  shareLink: () => void
  exportJson: () => void
  importJson: (text: string) => void
  showToast: (msg: string) => void
  setHelp: (o: boolean) => void
}

let lastKey = ''
let lastAt = 0
let toastTimer: ReturnType<typeof setTimeout> | undefined

const snap = (s: { nodes: SNode[]; edges: SEdge[] }): Snap => ({
  nodes: s.nodes.map((n) => ({ ...n, data: { ...n.data, config: { ...n.data.config } } })),
  edges: s.edges.map((e) => ({ ...e, data: e.data ? { ...e.data } : { ...DEFAULT_EDGE } })),
})

function smartEdgeData(src: SNode | undefined, tgt: SNode | undefined): SimEdgeData {
  const d: SimEdgeData = { ...DEFAULT_EDGE }
  if (!src || !tgt) return d
  if (src.data.kind === 'client') return d
  if (src.data.kind === 'pubsub') d.mode = 'all'
  if ((tgt.data.kind === 'queue' || tgt.data.kind === 'stream' || tgt.data.kind === 'pubsub') && !['queue', 'stream', 'pubsub'].includes(src.data.kind)) d.filter = 'write'
  if (tgt.data.kind === 'auth') d.mode = 'all'
  return d
}

const toNodes = (g: Graph): SNode[] =>
  g.nodes.map((n) => ({ ...n, type: 'sim', deletable: !n.data.locked, data: { ...n.data, config: { ...n.data.config } } }) as SNode)
const toEdges = (g: Graph): SEdge[] => g.edges.map((e) => ({ ...e, type: 'sim', data: { ...DEFAULT_EDGE, ...e.data } }) as SEdge)

function avgPos(ns: SNode[]) {
  if (!ns.length) return { x: 0, y: 0 }
  return { x: ns.reduce((s, n) => s + n.position.x, 0) / ns.length, y: ns.reduce((s, n) => s + n.position.y, 0) / ns.length }
}

export const useApp = create<AppState>((set, get) => ({
  title: 'Untitled system',
  saveStatus: 'saved',
  nodes: [],
  edges: [],
  selection: null,
  view: '2d',
  playing: true,
  speed: 600,
  time: 9 * 3600,
  chaos: emptyChaos(),
  challengeId: null,
  dayReport: null,
  dayRunning: false,
  limitReport: null,
  limitRunning: false,
  variants: loadVariants(),
  quickAddOpen: false,
  fitTick: 0,
  notes: [],
  passed: loadJSON<Record<string, PassRecord>>('archsim:passed', {}),
  interview: loadJSON<Interview | null>('archsim:interview', null),
  dockTab: 'advisor',
  past: [],
  future: [],
  toast: null,
  helpOpen: false,
  provider: (() => {
    try {
      const p = localStorage.getItem('archsim:provider')
      return p === 'gcp' || p === 'azure' ? p : 'aws'
    } catch {
      return 'aws'
    }
  })() as Provider,
  guide: null,
  theme: (() => {
    try {
      const t = localStorage.getItem('archsim:theme')
      if (t === 'light' || t === 'dark') return t
      return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    } catch {
      return 'light'
    }
  })() as 'light' | 'dark',
  toggleTheme: () => {
    const theme = get().theme === 'light' ? 'dark' : 'light'
    try {
      localStorage.setItem('archsim:theme', theme)
    } catch {
      /* ignore */
    }
    set({ theme })
  },
  paletteOpen: true,
  inspectorOpen: true,
  dockOpen: true,
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
  toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
  toggleDock: () => set((s) => ({ dockOpen: !s.dockOpen })),
  triggerFit: () => set((s) => ({ fitTick: s.fitTick + 1 })),
  removeNote: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),

  checkpoint: (key) => {
    const now = Date.now()
    if (key && key === lastKey && now - lastAt < 1200) {
      lastAt = now
      return
    }
    lastKey = key ?? ''
    lastAt = now
    const s = get()
    set({ past: [...s.past.slice(-79), snap(s)], future: [], dayReport: null })
  },
  undo: () => {
    const s = get()
    const prev = s.past[s.past.length - 1]
    if (!prev) return
    set({ past: s.past.slice(0, -1), future: [snap(s), ...s.future].slice(0, 80), nodes: prev.nodes, edges: prev.edges, dayReport: null })
    lastKey = ''
  },
  redo: () => {
    const s = get()
    const next = s.future[0]
    if (!next) return
    set({ future: s.future.slice(1), past: [...s.past, snap(s)], nodes: next.nodes, edges: next.edges, dayReport: null })
    lastKey = ''
  },

  onNodesChange: (all) => {
    const isNote = (c: NodeChange<SNode>) => 'id' in c && typeof c.id === 'string' && c.id.startsWith('note-')
    const noteChanges = all.filter(isNote) as unknown as NodeChange<NNode>[]
    if (noteChanges.length) set((s) => ({ notes: applyNodeChanges(noteChanges, s.notes) }))
    const changes = all.filter((c) => !isNote(c))
    if (!changes.length) return
    if (changes.some((c) => c.type === 'remove')) get().checkpoint()
    const removed = changes.filter((c) => c.type === 'remove').map((c) => (c as { id: string }).id)
    set((s) => {
      const sel = s.selection && removed.includes(s.selection.id) ? null : s.selection
      return { nodes: applyNodeChanges(changes, s.nodes), selection: sel }
    })
  },
  onEdgesChange: (changes) => {
    if (changes.some((c) => c.type === 'remove')) get().checkpoint()
    set((s) => ({ edges: applyEdgeChanges(changes, s.edges) }))
  },
  onConnect: (c) => {
    const s = get()
    if (!c.source || !c.target || c.source === c.target) return
    if (s.edges.some((e) => e.source === c.source && e.target === c.target)) return
    const reachable = (from: string, goal: string, seen = new Set<string>()): boolean => {
      if (from === goal) return true
      if (seen.has(from)) return false
      seen.add(from)
      return s.edges.some((e) => e.source === from && reachable(e.target, goal, seen))
    }
    if (reachable(c.target, c.source)) {
      get().showToast('That connection would create a cycle')
      return
    }
    get().checkpoint()
    const src = s.nodes.find((n) => n.id === c.source)
    const tgt = s.nodes.find((n) => n.id === c.target)
    const edge: SEdge = { ...c, id: uid('e'), type: 'sim', data: smartEdgeData(src, tgt) } as SEdge
    set({ edges: addEdge(edge, s.edges) as SEdge[] })
  },

  addNode: (kind, pos) => {
    get().checkpoint()
    const s = get()
    const id = uid(kind)
    let position = pos
    if (!position) {
      const maxX = s.nodes.reduce((m, n) => Math.max(m, n.position.x), -250)
      position = { x: maxX + 250, y: 150 }
    }
    const cfg = defaultConfig(kind)
    // new infra defaults to the region used most in the graph
    if (!CATALOG[kind].global && kind !== 'client') {
      const counts = new Map<string, number>()
      s.nodes.forEach((n) => n.data.kind !== 'client' && n.data.config.region !== 'global' && counts.set(n.data.config.region, (counts.get(n.data.config.region) ?? 0) + 1))
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
      if (top) cfg.region = top[0]
    }
    const n: SNode = { id, type: 'sim', position, data: { kind, label: CATALOG[kind].label, config: cfg } }
    set({ nodes: [...s.nodes, n], selection: { type: 'node', id } })
    return id
  },
  updateConfig: (id, patch) => {
    get().checkpoint(`cfg-${id}-${Object.keys(patch).join(',')}`)
    if ('instances' in patch || 'autoscale' in patch || 'minInstances' in patch || 'maxInstances' in patch) resetRuntime([id])
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, config: { ...n.data.config, ...patch } } } : n)),
    }))
  },
  rename: (id, label) => {
    get().checkpoint(`name-${id}`)
    set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, label } } : n)) }))
  },
  updateEdge: (id, patch) => {
    get().checkpoint(`edge-${id}`)
    set((s) => ({ edges: s.edges.map((e) => (e.id === id ? { ...e, data: { ...DEFAULT_EDGE, ...e.data, ...patch } } : e)) }))
  },
  removeNode: (id) => {
    const n = get().nodes.find((x) => x.id === id)
    if (!n || n.data.locked) return
    get().checkpoint()
    set((s) => ({
      nodes: s.nodes.filter((x) => x.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      selection: null,
    }))
  },
  removeEdge: (id) => {
    get().checkpoint()
    set((s) => ({ edges: s.edges.filter((e) => e.id !== id), selection: null }))
  },
  duplicate: (id) => {
    const n = get().nodes.find((x) => x.id === id)
    if (!n) return
    get().checkpoint()
    const nid = uid(n.data.kind)
    const copy: SNode = { ...n, id: nid, selected: false, deletable: true, position: { x: n.position.x + 40, y: n.position.y + 120 }, data: { ...n.data, locked: false, label: `${n.data.label} copy`, config: { ...n.data.config } } }
    set((s) => ({ nodes: [...s.nodes, copy], selection: { type: 'node', id: nid } }))
  },
  select: (selection) => set({ selection }),

  setView: (view) => set({ view }),
  togglePlay: () => set((s) => ({ playing: !s.playing })),
  setSpeed: (speed) => set({ speed }),
  setTime: (time) => set({ time }),
  setDockTab: (dockTab) => set({ dockTab }),
  setTitle: (title) => set({ title }),

  loadGraph: (g, { title, challengeId = null, keepGuide = false, keepDock = false, notes = [] }) => {
    const s = get()
    set({
      notes,
      guide: keepGuide ? s.guide : null,
      past: s.nodes.length ? [...s.past.slice(-79), snap(s)] : s.past,
      future: [],
      nodes: toNodes(g),
      edges: toEdges(g),
      title,
      challengeId,
      selection: null,
      chaos: emptyChaos(),
      dayReport: null,
      limitReport: null,
      time: 9 * 3600,
      dockTab: keepDock ? s.dockTab : challengeId ? 'challenge' : s.dockTab === 'challenge' ? 'advisor' : s.dockTab,
      fitTick: keepGuide ? s.fitTick : s.fitTick + 1,
    })
    resetRuntime()
  },
  loadTemplate: (id) => {
    const t = TEMPLATES.find((x) => x.id === id)
    if (t) get().loadGraph(t.build(), { title: t.title.replace(/^\d+ · /, '') })
  },
  startChallenge: (id) => {
    const c = CHALLENGES.find((x) => x.id === id)
    if (c) get().loadGraph(c.build(-1), { title: `Challenge: ${c.title}`, challengeId: id })
  },
  startGuide: (challengeId) => {
    const c = CHALLENGES.find((x) => x.id === challengeId)
    if (!c) return
    get().loadGraph(c.build(0), { title: `Solution: ${c.title}`, challengeId })
    set({ guide: { challengeId, step: 0 }, dockTab: 'challenge', playing: true })
  },
  guideTo: (step) => {
    const g = get().guide
    const c = g && CHALLENGES.find((x) => x.id === g.challengeId)
    if (!g || !c) return
    const st = Math.max(0, Math.min(c.steps.length - 1, step))
    const keepTime = get().time
    get().loadGraph(c.build(st), { title: `Solution: ${c.title}`, challengeId: c.id, keepGuide: true, keepDock: true })
    set({ guide: { challengeId: c.id, step: st }, time: keepTime, past: get().past.slice(0, -1) })
  },
  exitGuide: () => {
    const g = get().guide
    set({ guide: null })
    if (g) get().startChallenge(g.challengeId)
  },
  setProvider: (provider) => {
    try {
      localStorage.setItem('archsim:provider', provider)
    } catch {
      /* ignore */
    }
    set({ provider })
  },
  toggleAZ: (r) =>
    set((s) => {
      const list = s.chaos.failedAZs ?? []
      const has = list.includes(r)
      return { chaos: { ...s.chaos, failedAZs: has ? list.filter((x) => x !== r) : [...list, r] } }
    }),

  toggleNodeFail: (id) =>
    set((s) => {
      const has = s.chaos.failedNodes.includes(id)
      return { chaos: { ...s.chaos, failedNodes: has ? s.chaos.failedNodes.filter((x) => x !== id) : [...s.chaos.failedNodes, id] } }
    }),
  toggleRegion: (r) =>
    set((s) => {
      const has = s.chaos.failedRegions.includes(r)
      return { chaos: { ...s.chaos, failedRegions: has ? s.chaos.failedRegions.filter((x) => x !== r) : [...s.chaos.failedRegions, r] } }
    }),
  toggleEdgeCut: (id) =>
    set((s) => {
      const has = s.chaos.cutEdges.includes(id)
      return { chaos: { ...s.chaos, cutEdges: has ? s.chaos.cutEdges.filter((x) => x !== id) : [...s.chaos.cutEdges, id] } }
    }),
  setEdgeDelay: (id, ms) =>
    set((s) => {
      const edgeDelay = { ...s.chaos.edgeDelay }
      if (ms > 0) edgeDelay[id] = ms
      else delete edgeDelay[id]
      return { chaos: { ...s.chaos, edgeDelay } }
    }),
  setTrafficMult: (x) => set((s) => ({ chaos: { ...s.chaos, trafficMult: x } })),
  flushCache: (id) => set((s) => ({ chaos: { ...s.chaos, flushedCaches: { ...s.chaos.flushedCaches, [id]: s.time } } })),
  flushAllCaches: () =>
    set((s) => {
      const f = { ...s.chaos.flushedCaches }
      s.nodes.forEach((n) => (n.data.kind === 'cache' || n.data.kind === 'cdn') && (f[n.id] = s.time))
      return { chaos: { ...s.chaos, flushedCaches: f } }
    }),
  clearChaos: () => set({ chaos: emptyChaos() }),

  applyFix: (f) => {
    const s = get()
    if (f.type === 'patch') {
      get().updateConfig(f.nodeId, f.patch)
      get().showToast('Fix applied')
      return
    }
    if (f.type === 'edge') {
      get().updateEdge(f.edgeId, f.patch)
      get().showToast('Fix applied')
      return
    }
    const anchor = s.nodes.find((n) => n.id === f.nodeId)
    if (!anchor) return
    get().checkpoint()
    const id = uid(f.kind)
    const cfg = defaultConfig(f.kind, f.patch ?? {})
    if (!CATALOG[f.kind].global && !f.patch?.region) cfg.region = anchor.data.config.region === 'global' ? 'us-east-1' : anchor.data.config.region
    if (f.type === 'insertBefore') {
      const parents = s.edges.filter((e) => e.target === anchor.id).map((e) => s.nodes.find((n) => n.id === e.source)!).filter(Boolean)
      const p = avgPos(parents.length ? parents : [anchor])
      const tooClose = parents.length > 0 && Math.abs(anchor.position.x - p.x) < 220
      const pos = parents.length
        ? { x: (p.x + anchor.position.x) / 2, y: (p.y + anchor.position.y) / 2 + (tooClose ? 125 : 0) }
        : { x: anchor.position.x - 240, y: anchor.position.y }
      const n: SNode = { id, type: 'sim', position: pos, data: { kind: f.kind, label: CATALOG[f.kind].label, config: cfg } }
      const edges = s.edges.map((e) => (e.target === anchor.id ? { ...e, target: id } : e))
      edges.push({ id: uid('e'), source: id, target: anchor.id, type: 'sim', data: { ...DEFAULT_EDGE } } as SEdge)
      set({ nodes: [...s.nodes, n], edges, selection: { type: 'node', id } })
    } else {
      const kids = s.edges.filter((e) => e.source === anchor.id).map((e) => s.nodes.find((n) => n.id === e.target)!).filter(Boolean)
      const k = avgPos(kids.length ? kids : [anchor])
      const tooClose = kids.length > 0 && Math.abs(k.x - anchor.position.x) < 220
      const pos = kids.length
        ? { x: (k.x + anchor.position.x) / 2, y: (k.y + anchor.position.y) / 2 - (tooClose ? 125 : 0) }
        : { x: anchor.position.x + 240, y: anchor.position.y }
      const n: SNode = { id, type: 'sim', position: pos, data: { kind: f.kind, label: CATALOG[f.kind].label, config: cfg } }
      const edges = s.edges.map((e) => (e.source === anchor.id ? { ...e, source: id } : e))
      edges.push({ id: uid('e'), source: anchor.id, target: id, type: 'sim', data: { ...DEFAULT_EDGE } } as SEdge)
      set({ nodes: [...s.nodes, n], edges, selection: { type: 'node', id } })
    }
    get().showToast(`Inserted ${CATALOG[f.kind].label}`)
  },

  runDayTest: () => {
    set({ dayRunning: true, dockTab: get().challengeId ? 'challenge' : 'tests' })
    setTimeout(() => {
      const s = get()
      const report = runDay(s.nodes, s.edges, s.chaos, 60)
      set({ dayReport: report, dayRunning: false })
      // remember challenges solved by your own design (not by watching the solution)
      const ch = CHALLENGES.find((c) => c.id === s.challengeId)
      if (ch && !s.guide) {
        const t = ch.targets
        const ok = report.dayP99 <= t.p99 && report.dayAvailability >= t.availability && report.avgMonthlyCost <= t.budget && (!t.backlogSec || report.maxBacklogSec <= t.backlogSec) && ch.checks.every((k) => k.test({ nodes: s.nodes, edges: s.edges }))
        if (ok) {
          const prev = get().passed[ch.id]
          const rec = { at: Date.now(), cost: report.avgMonthlyCost, p99: report.dayP99 }
          const passed = { ...get().passed, [ch.id]: prev && prev.cost < rec.cost ? prev : rec }
          set({ passed })
          saveJSON('archsim:passed', passed)
        }
      }
    }, 30)
  },

  shareLink: () => {
    const s = get()
    const payload = serialize(s)
    const url = `${location.origin}${location.pathname}#g=${compressToEncodedURIComponent(JSON.stringify(payload))}`
    history.replaceState(null, '', url)
    navigator.clipboard?.writeText(url).then(
      () => get().showToast('Share link copied to clipboard'),
      () => get().showToast('Link is in the address bar — copy it from there'),
    )
  },
  exportJson: () => {
    const s = get()
    const blob = new Blob([JSON.stringify(serialize(s), null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${s.title.replace(/[^\w-]+/g, '-').toLowerCase() || 'system'}.archsim.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  },
  importJson: (text) => {
    try {
      const g = deserialize(JSON.parse(text))
      get().loadGraph(g.graph, { title: g.title, challengeId: g.challengeId, notes: g.notes })
      get().showToast('Imported')
    } catch {
      get().showToast('That file is not an ArchSim design')
    }
  },
  showToast: (msg) => {
    clearTimeout(toastTimer)
    set({ toast: msg })
    toastTimer = setTimeout(() => set({ toast: null }), 2600)
  },
  setHelp: (helpOpen) => set({ helpOpen }),
  runLimit: () => {
    set({ limitRunning: true, dockTab: 'tests' })
    setTimeout(() => {
      const s = get()
      set({ limitReport: findLimit(s.nodes, s.edges, s.chaos), limitRunning: false })
    }, 30)
  },
  saveVariant: (name) => {
    const s = get()
    const v: Variant = { id: uid('v'), name: name.trim() || `Variant ${s.variants.length + 1}`, savedAt: Date.now(), ...snap(s), metrics: measure(s.nodes, s.edges) }
    const variants = [...s.variants, v].slice(-12)
    set({ variants })
    persistVariants(variants)
    get().showToast(`Saved “${v.name}”`)
  },
  loadVariant: (id) => {
    const v = get().variants.find((x) => x.id === id)
    if (!v) return
    get().loadGraph({ nodes: v.nodes, edges: v.edges } as unknown as Graph, { title: v.name, keepDock: true })
    get().showToast(`Loaded “${v.name}”`)
  },
  deleteVariant: (id) => {
    const variants = get().variants.filter((v) => v.id !== id)
    set({ variants })
    persistVariants(variants)
  },
  copySelection: () => {
    const s = get()
    let picked = s.nodes.filter((n) => n.selected)
    if (!picked.length && s.selection?.type === 'node') picked = s.nodes.filter((n) => n.id === s.selection!.id)
    if (!picked.length) return
    const ids = new Set(picked.map((n) => n.id))
    clipboard = { nodes: picked.map((n) => structuredClone(n)), edges: s.edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => structuredClone(e)) }
    pasteCount = 0
    get().showToast(`Copied ${picked.length} component${picked.length > 1 ? 's' : ''}`)
  },
  paste: () => {
    if (!clipboard) return
    get().checkpoint()
    pasteCount++
    const map = new Map<string, string>()
    const nodes = clipboard.nodes.map((n) => {
      const id = uid(n.data.kind)
      map.set(n.id, id)
      return { ...n, id, selected: true, deletable: true, position: { x: n.position.x + 50 * pasteCount, y: n.position.y + 120 * pasteCount }, data: { ...n.data, locked: false, config: { ...n.data.config } } } as SNode
    })
    const edges = clipboard.edges.map((e) => ({ ...e, id: uid('e'), source: map.get(e.source)!, target: map.get(e.target)!, selected: false }) as SEdge)
    set((st) => ({ nodes: [...st.nodes.map((n) => ({ ...n, selected: false })), ...nodes], edges: [...st.edges, ...edges], selection: nodes.length === 1 ? { type: 'node', id: nodes[0].id } : st.selection }))
  },
  tidyLayout: () => {
    const s = get()
    if (!s.nodes.length) return
    get().checkpoint()
    // longest-path layering: every node sits one column right of its furthest parent
    const rank = new Map<string, number>(s.nodes.map((n) => [n.id, 0]))
    for (let pass = 0; pass < s.nodes.length; pass++) {
      let changed = false
      for (const e of s.edges) {
        const r = (rank.get(e.source) ?? 0) + 1
        if (r > (rank.get(e.target) ?? 0) && r < s.nodes.length) {
          rank.set(e.target, r)
          changed = true
        }
      }
      if (!changed) break
    }
    const cols = new Map<number, SNode[]>()
    s.nodes.forEach((n) => {
      const r = rank.get(n.id) ?? 0
      if (!cols.has(r)) cols.set(r, [])
      cols.get(r)!.push(n)
    })
    const pos = new Map<string, { x: number; y: number }>()
    cols.forEach((list, r) => {
      list.sort((a, b) => a.position.y - b.position.y)
      const h = (list.length - 1) * 165
      list.forEach((n, i) => pos.set(n.id, { x: r * 260, y: i * 165 - h / 2 }))
    })
    set({ nodes: s.nodes.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position })), fitTick: s.fitTick + 1 })
  },
  setQuickAdd: (quickAddOpen) => set({ quickAddOpen }),
  addNote: (pos) => {
    const s = get()
    const p = pos ?? { x: s.nodes.reduce((m, n) => Math.min(m, n.position.x), 0), y: s.nodes.reduce((m, n) => Math.min(m, n.position.y), 0) - 200 }
    const note: NNode = { id: `note-${Date.now().toString(36)}`, type: 'note', position: p, width: 220, height: 150, data: { text: '', color: 'yellow' }, selected: true }
    set({ notes: [...s.notes.map((n) => ({ ...n, selected: false })), note] })
  },
  updateNote: (id, patch) => set((s) => ({ notes: s.notes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)) })),
  startInterview: (minutes) => {
    const iv: Interview = { startedAt: Date.now(), minutes, notes: {}, finishedAt: null, challengeId: get().challengeId }
    set({ interview: iv, dockTab: 'practice' })
    saveJSON('archsim:interview', iv)
  },
  setInterviewNote: (phase, text) => {
    const iv = get().interview
    if (!iv) return
    const next = { ...iv, notes: { ...iv.notes, [phase]: text } }
    set({ interview: next })
    saveJSON('archsim:interview', next)
  },
  finishInterview: () => {
    const iv = get().interview
    if (!iv) return
    const next = { ...iv, finishedAt: Date.now() }
    set({ interview: next })
    saveJSON('archsim:interview', next)
  },
  clearInterview: () => {
    set({ interview: null })
    saveJSON('archsim:interview', null)
  },
}))

// ---------------- small storage helpers ----------------
function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
function saveJSON(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    /* storage unavailable */
  }
}

// ---------------- variants, clipboard ----------------
let clipboard: { nodes: SNode[]; edges: SEdge[] } | null = null
let pasteCount = 0

/** Peak-hour steady-state numbers, so saved variants compare like for like. */
export function measure(nodes: SNode[], edges: SEdge[]): VariantMetrics {
  const r = steadyState(nodes, edges, emptyChaos())
  const t = r.totals
  return {
    rps: t.offered, p99: t.p99, avgLatency: t.avgLatency, availability: t.availability, cost: t.monthlyCost,
    bottleneck: nodes.find((n) => n.id === t.bottleneckId)?.data.label ?? '—', nodes: nodes.length,
  }
}

function loadVariants(): Variant[] {
  try {
    const raw = localStorage.getItem('archsim:variants')
    const list = raw ? (JSON.parse(raw) as Variant[]) : []
    return Array.isArray(list) ? list.filter((v) => v && Array.isArray(v.nodes) && v.metrics) : []
  } catch {
    return []
  }
}
function persistVariants(v: Variant[]) {
  try {
    localStorage.setItem('archsim:variants', JSON.stringify(v))
  } catch {
    /* storage full or unavailable */
  }
}

// ---------------- persistence ----------------
interface Saved {
  v: 1
  title: string
  challengeId: string | null
  nodes: { id: string; p: [number, number]; d: SimNodeData }[]
  edges: { id: string; s: string; t: string; d?: SimEdgeData }[]
  notes?: { id: string; p: [number, number]; w?: number; h?: number; text: string; color: NoteColor }[]
}

function serialize(s: { title: string; challengeId: string | null; nodes: SNode[]; edges: SEdge[]; notes?: NNode[] }): Saved {
  return {
    v: 1,
    title: s.title,
    challengeId: s.challengeId,
    nodes: s.nodes.map((n) => ({ id: n.id, p: [Math.round(n.position.x), Math.round(n.position.y)], d: n.data })),
    edges: s.edges.map((e) => ({ id: e.id, s: e.source, t: e.target, d: e.data })),
    notes: (s.notes ?? []).map((n) => ({ id: n.id, p: [Math.round(n.position.x), Math.round(n.position.y)], w: Math.round(n.width ?? n.measured?.width ?? 220), h: Math.round(n.height ?? n.measured?.height ?? 150), text: n.data.text, color: n.data.color })),
  }
}

const NOTE_COLORS: NoteColor[] = ['yellow', 'pink', 'blue', 'green']
function deserialize(raw: unknown): { title: string; challengeId: string | null; graph: Graph; notes: NNode[] } {
  const o = raw as Saved
  if (!o || o.v !== 1 || !Array.isArray(o.nodes) || !Array.isArray(o.edges)) throw new Error('bad')
  const nodes = o.nodes
    .filter((n) => n && n.d && CATALOG[n.d.kind as NodeKind])
    .map((n) => ({
      id: String(n.id), type: 'sim', position: { x: Number(n.p?.[0]) || 0, y: Number(n.p?.[1]) || 0 },
      data: { kind: n.d.kind, label: String(n.d.label ?? CATALOG[n.d.kind].label).slice(0, 60), locked: !!n.d.locked, config: defaultConfig(n.d.kind, n.d.config ?? {}) },
    }))
  const ids = new Set(nodes.map((n) => n.id))
  const edges = o.edges
    .filter((e) => ids.has(e.s) && ids.has(e.t))
    .map((e) => ({ id: String(e.id), source: e.s, target: e.t, type: 'sim', data: { ...DEFAULT_EDGE, ...(e.d ?? {}) } }))
  const challengeId = o.challengeId && CHALLENGES.some((c) => c.id === o.challengeId) ? o.challengeId : null
  const notes: NNode[] = (Array.isArray(o.notes) ? o.notes : []).slice(0, 100).map((n) => ({
    id: String(n.id).startsWith('note-') ? String(n.id) : `note-${String(n.id)}`, type: 'note' as const,
    position: { x: Number(n.p?.[0]) || 0, y: Number(n.p?.[1]) || 0 },
    width: Math.min(800, Math.max(120, Number(n.w) || 220)), height: Math.min(800, Math.max(80, Number(n.h) || 150)),
    data: { text: String(n.text ?? '').slice(0, 4000), color: NOTE_COLORS.includes(n.color) ? n.color : 'yellow' },
  }))
  return { title: String(o.title ?? 'Imported system').slice(0, 80), challengeId, graph: { nodes, edges }, notes }
}

const LS_KEY = 'archsim:v1'

export function initFromUrlOrStorage() {
  const st = useApp.getState()
  const m = location.hash.match(/#g=(.+)$/)
  if (m) {
    try {
      const json = decompressFromEncodedURIComponent(m[1])
      const g = deserialize(JSON.parse(json ?? ''))
      st.loadGraph(g.graph, { title: g.title, challengeId: g.challengeId, notes: g.notes })
      useApp.setState({ past: [] })
      return
    } catch {
      /* fall through */
    }
  }
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const g = deserialize(JSON.parse(raw))
      st.loadGraph(g.graph, { title: g.title, challengeId: g.challengeId, notes: g.notes })
      useApp.setState({ past: [] })
      return
    }
  } catch {
    /* ignore */
  }
  st.loadTemplate('three-tier')
  useApp.setState({ past: [] })
}

let saveTimer: ReturnType<typeof setTimeout> | undefined
useApp.subscribe((s, prev) => {
  if (s.nodes === prev.nodes && s.edges === prev.edges && s.notes === prev.notes && s.title === prev.title && s.challengeId === prev.challengeId) return
  clearTimeout(saveTimer)
  if (s.saveStatus !== 'saving') useApp.setState({ saveStatus: 'saving' })
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(serialize(useApp.getState())))
      useApp.setState({ saveStatus: 'saved' })
    } catch {
      useApp.setState({ saveStatus: 'error' })
    }
  }, 600)
})
