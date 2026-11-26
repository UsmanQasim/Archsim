export type NodeKind =
  | 'client'
  | 'dns'
  | 'cdn'
  | 'waf'
  | 'ratelimiter'
  | 'lb'
  | 'gateway'
  | 'app'
  | 'serverless'
  | 'worker'
  | 'sql'
  | 'nosql'
  | 'cache'
  | 'storage'
  | 'search'
  | 'queue'
  | 'stream'
  | 'container'
  | 'k8s'
  | 'edgefn'
  | 'auth'
  | 'websocket'
  | 'pubsub'
  | 'notify'
  | 'globaldb'
  | 'warehouse'
  | 'streamproc'
  | 'inference'
  | 'external'

export type Pattern = 'steady' | 'daily' | 'spike' | 'growth'
export type SizeKey = 'S' | 'M' | 'L' | 'XL'
export type PricingModel = 'ondemand' | 'reserved' | 'spot'
export type Arch = 'x86' | 'arm'
export type Consistency = 'eventual' | 'strong'
export type Provider = 'aws' | 'gcp' | 'azure'

export interface NodeConfig {
  region: string
  instances: number
  size: SizeKey
  autoscale: boolean
  minInstances: number
  maxInstances: number
  // traffic (clients)
  users: number
  reqPerUserMin: number
  readRatio: number
  payloadKB: number
  pattern: Pattern
  // caches / cdn
  hitRate: number
  // databases
  replicas: number
  shards: number
  storageGB: number
  // limits
  rateLimit: number
  // service time
  latencyMs: number
  // cost & resilience levers
  pricing: PricingModel
  arch: Arch
  multiAz: boolean
  consistency: Consistency
  /** $ per 1,000 calls (external APIs, notifications) */
  unitCost: number
}

export interface SimNodeData {
  kind: NodeKind
  label: string
  config: NodeConfig
  locked?: boolean
  [key: string]: unknown
}

export type EdgeMode = 'split' | 'all'
export type EdgeFilter = 'any' | 'read' | 'write'

export interface SimEdgeData {
  mode: EdgeMode
  filter: EdgeFilter
  weight: number
  /** client-side retries on failure (0–3) */
  retries?: number
  /** circuit breaker: stop calling a target that is mostly failing */
  breaker?: boolean
  [key: string]: unknown
}

/** Minimal structural graph types: React Flow nodes/edges satisfy these. */
export interface GraphNode {
  id: string
  position: { x: number; y: number }
  data: SimNodeData
}
export interface GraphEdge {
  id: string
  source: string
  target: string
  data?: SimEdgeData
}

export interface Chaos {
  failedNodes: string[]
  failedRegions: string[]
  /** regions where one availability zone is down */
  failedAZs: string[]
  cutEdges: string[]
  edgeDelay: Record<string, number>
  trafficMult: number
  /** cache/cdn id -> absolute sim time when it was flushed */
  flushedCaches: Record<string, number>
}

export const emptyChaos = (): Chaos => ({
  failedNodes: [],
  failedRegions: [],
  failedAZs: [],
  cutEdges: [],
  edgeDelay: {},
  trafficMult: 1,
  flushedCaches: {},
})

export interface NodeMetrics {
  inRead: number
  inWrite: number
  servedRps: number
  droppedRps: number
  throttledRps: number
  util: number
  capacity: number
  instances: number
  latency: number
  p99: number
  cost: number
  egressCost: number
  healthy: boolean
  effectiveHit?: number
  backlog?: number
  backlogAgeSec?: number
  /** this tick's retry amplification of incoming load (1 = none) */
  retryAmp?: number
  azDegraded?: boolean
  /** end-to-end success ratio for requests reaching this node (incl. downstream) */
  success: number
  /** client nodes only */
  e2eLatency?: number
  e2eP99?: number
  offered?: number
}

export interface EdgeMetrics {
  rps: number
  errRate: number
  latencyMs: number
  healthy: boolean
  back: boolean
}

export interface Totals {
  offered: number
  success: number
  errors: number
  availability: number
  avgLatency: number
  p99: number
  monthlyCost: number
  egressCost: number
  costPerMillion: number
  bottleneckId: string | null
  bottleneckUtil: number
  maxBacklogSec: number
}

export interface SimResult {
  time: number
  nodes: Record<string, NodeMetrics>
  edges: Record<string, EdgeMetrics>
  totals: Totals
  warnings: string[]
}

export interface Runtime {
  instances: Record<string, number>
  cooldown: Record<string, number>
  backlog: Record<string, number>
  /** end-to-end success of each node on the previous tick (drives retries) */
  prevSuccess: Record<string, number>
}

export const emptyRuntime = (): Runtime => ({ instances: {}, cooldown: {}, backlog: {}, prevSuccess: {} })
