/**
 * Classic system-design interview problems.
 * Each has locked user traffic, targets, structural design checks and a staged
 * reference solution: build(step) returns the architecture after `step` improvements
 * (step -1 = only the users, i.e. the empty challenge).
 */
import { CATALOG, defaultConfig } from './catalog'
import { DEFAULT_EDGE } from './engine'
import type { Graph } from './scenarios'
import type { GraphEdge, GraphNode, NodeConfig, NodeKind, Pattern, SimEdgeData } from './types'
import { compileSpec } from './spec'
import { EXTRA_PROBLEMS } from './problems'

export interface DesignCheck {
  label: string
  why: string
  test: (g: { nodes: GraphNode[]; edges: GraphEdge[] }) => boolean
}

export interface SolutionStep {
  title: string
  why: string
}

export interface Challenge {
  id: string
  title: string
  difficulty: 'Easy' | 'Medium' | 'Hard'
  topic: string
  brief: string
  concepts: string[]
  hints: string[]
  targets: { p99: number; availability: number; budget: number; backlogSec?: number }
  checks: DesignCheck[]
  steps: SolutionStep[]
  /** step -1 → users only; 0..steps.length-1 → reference architecture after that step */
  build: (step: number) => Graph
  tags?: string[]
  author?: string
  /** set for challenges defined as data (extra problems, editor-made, from links) */
  spec?: import('./spec').ChallengeSpec
}

// ------------------------------------------------------------------ staged builder
const X = 235
const Y = 150
type Patch = Partial<NodeConfig> | ((step: number) => Partial<NodeConfig>)

function staged(step: number) {
  const g: Graph = { nodes: [], edges: [] }
  const present = new Set<string>()
  const add = (from: number, key: string, kind: NodeKind, col: number, row: number, label?: string, patch: Patch = {}, locked = false): string => {
    const id = `n-${key}`
    if (step >= from) {
      const p = typeof patch === 'function' ? patch(step) : patch
      present.add(id)
      g.nodes.push({ id, type: 'sim', position: { x: col * X, y: row * Y }, data: { kind, label: label ?? CATALOG[kind].label, config: defaultConfig(kind, p), locked } })
    }
    return id
  }
  /** connection that exists for steps in [from, until) */
  const link = (a: string, b: string, data: Partial<SimEdgeData> = {}, from = -1, until = Infinity) => {
    if (step < from || step >= until || !present.has(a) || !present.has(b)) return
    g.edges.push({ id: `e-${a}-${b}`, source: a, target: b, type: 'sim', data: { ...DEFAULT_EDGE, ...data } })
  }
  const users = (key: string, row: number, label: string, region: string, users: number, rpm: number, read: number, payloadKB: number, pattern: Pattern = 'daily') =>
    add(-1, key, 'client', 0, row, label, { region, users, reqPerUserMin: rpm, readRatio: read, payloadKB, pattern }, true)
  /** remove a node (and its edges) from this step's graph */
  const retire = (cond: boolean, ...ids: string[]) => {
    if (!cond) return
    g.nodes = g.nodes.filter((n) => !ids.includes(n.id))
    g.edges = g.edges.filter((e) => !ids.includes(e.source) && !ids.includes(e.target))
  }
  return { g, add, link, users, retire }
}

// ------------------------------------------------------------------ check helpers
type G = { nodes: GraphNode[]; edges: GraphEdge[] }
const K = (g: G, ...kinds: NodeKind[]) => g.nodes.filter((n) => kinds.includes(n.data.kind))
const has = (g: G, ...kinds: NodeKind[]) => K(g, ...kinds).length > 0
const kindOf = (g: G, id: string) => g.nodes.find((n) => n.id === id)?.data.kind
const edgeKinds = (g: G, from: NodeKind[], to: NodeKind[]) =>
  g.edges.some((e) => from.includes(kindOf(g, e.source)!) && to.includes(kindOf(g, e.target)!))
/** is there a path from any `from` node to any `to` node, passing only through nodes that satisfy `via`? */
function reaches(g: G, from: (n: GraphNode) => boolean, to: (n: GraphNode) => boolean, via: (n: GraphNode) => boolean = () => true): boolean {
  const byId = new Map(g.nodes.map((n) => [n.id, n]))
  const start = g.nodes.filter(from).map((n) => n.id)
  const seen = new Set(start)
  const q = [...start]
  while (q.length) {
    const id = q.shift()!
    for (const e of g.edges) {
      if (e.source !== id || seen.has(e.target)) continue
      const t = byId.get(e.target)
      if (!t) continue
      if (to(t)) return true
      if (!via(t)) continue
      seen.add(t.id)
      q.push(t.id)
    }
  }
  return false
}
const isK = (...kinds: NodeKind[]) => (n: GraphNode) => kinds.includes(n.data.kind)
const notK = (...kinds: NodeKind[]) => (n: GraphNode) => !kinds.includes(n.data.kind)
const COMPUTE: NodeKind[] = ['app', 'container', 'k8s', 'serverless']
const sqlSafe = (g: G) => K(g, 'sql').length > 0 && K(g, 'sql').every((n) => n.data.config.multiAz || n.data.config.replicas > 0)

const CHECK = {
  cacheReads: (what = 'Hot reads'): DesignCheck => ({
    label: `${what} are served from a cache`,
    why: 'Caches answer in ~1 ms and absorb most read traffic before it reaches the database.',
    test: (g) => has(g, 'cache', 'cdn', 'edgefn') && reaches(g, isK('client'), isK('cache', 'cdn', 'edgefn')),
  }),
  behindLb: (): DesignCheck => ({
    label: 'Servers sit behind a load balancer or gateway',
    why: 'Health checks route around dead instances; users never talk to a single box.',
    test: (g) => !g.edges.some((e) => kindOf(g, e.source) === 'client' && ['app', 'k8s'].includes(kindOf(g, e.target)!)),
  }),
  dbSurvivesAz: (): DesignCheck => ({
    label: 'SQL survives an availability-zone outage',
    why: 'A single-AZ database is the classic single point of failure. Multi-AZ standby or a replica fixes it.',
    test: (g) => !has(g, 'sql') || sqlSafe(g),
  }),
  queueBetween: (fromKinds: NodeKind[], toKinds: NodeKind[], label: string, why: string): DesignCheck => ({
    label, why,
    test: (g) => reaches(g, isK(...fromKinds), isK(...toKinds), isK('queue', 'stream', 'pubsub', 'worker', 'streamproc', 'serverless'))
      && !edgeKinds(g, fromKinds, toKinds),
  }),
  autoscaled: (): DesignCheck => ({
    label: 'The stateless tier autoscales',
    why: 'Traffic follows the day; fixed fleets are either too small at peak or wasted at night.',
    test: (g) => g.nodes.some((n) => CATALOG[n.data.kind].autoscalable && n.data.config.autoscale) || has(g, 'serverless'),
  }),
}

// ------------------------------------------------------------------ challenges
export const CHALLENGES: Challenge[] = [
  // ============================================================ URL shortener
  {
    id: 'shortener', title: 'URL Shortener', difficulty: 'Easy', topic: 'Caching',
    brief: 'Redirects for 300k active users in the US. 99 % of requests are reads of a short code. Every redirect must feel instant.',
    concepts: ['read-heavy workload', 'cache-aside', 'load balancing', 'Multi-AZ', 'reserved + ARM pricing'],
    hints: ['Reads dwarf writes — what can answer a redirect without touching the database?', 'Do not let one server or one database zone take you down.', 'Once it works, open the Cost tab: the always-on baseline can be reserved.'],
    targets: { p99: 250, availability: 0.999, budget: 8500 },
    checks: [CHECK.behindLb(), CHECK.cacheReads('Redirect lookups'), CHECK.dbSurvivesAz(), CHECK.autoscaled()],
    steps: [
      { title: 'Start simple: one server, one database', why: 'The naïve design: every redirect hits a single server and the database. Watch it melt — 30k req/s against ~400 req/s of capacity.' },
      { title: 'Load balancer + autoscaling app tier', why: 'Stateless servers behind an ALB scale horizontally. Autoscaling follows the daily wave so you pay for peak only at peak.' },
      { title: 'Cache the hot short codes', why: 'Short links follow a power law: a 90 % hit rate in Redis removes almost all database reads and cuts latency to a couple of ms.' },
      { title: 'Survive a zone outage', why: 'Multi-AZ gives the database a synchronous standby. Try Chaos → AZ outage now: nothing fails.' },
      { title: 'Cut the bill: ARM + reserved baseline', why: 'Graviton-class ARM is ~20 % cheaper; committing the minimum fleet to a 1-year plan saves ~40 % on it. Same performance, lower cost.' },
    ],
    build: (step) => {
      const { g, add, link, users } = staged(step)
      const u = users('u', 1, 'Users · New York', 'city-nyc', 300000, 6, 0.99, 1)
      const lb = add(1, 'lb', 'lb', 1, 1, 'Load Balancer')
      const app = add(0, 'app', 'app', 2, 1, 'Redirect API', (s) => s === 0 ? { instances: 1, size: 'S', minInstances: 1 } : { autoscale: true, instances: 20, minInstances: 6, maxInstances: 120, size: 'M', ...(s >= 4 ? { arch: 'arm', pricing: 'reserved' } : {}) })
      const c = add(2, 'cache', 'cache', 3, 0.3, 'Redis', (s) => ({ hitRate: 0.92, instances: 2, ...(s >= 4 ? { arch: 'arm' } : {}) }))
      const db = add(0, 'db', 'sql', 4, 1, 'Links DB', (s) => ({ size: 'M', multiAz: s >= 3 }))
      link(u, app, {}, 0, 1)
      link(u, lb, {}, 1)
      link(lb, app)
      link(app, db, {}, 0, 2)
      link(app, c, { filter: 'read' }, 2)
      link(c, db, {}, 2)
      link(app, db, { filter: 'write' }, 2)
      return g
    },
  },
  // ============================================================ Leaderboard
  {
    id: 'leaderboard', title: 'Gaming Leaderboard', difficulty: 'Easy', topic: 'Data structures',
    brief: 'One million players in Seoul submit scores and check their rank. Half the traffic is writes. Ranks must update instantly.',
    concepts: ['Redis sorted sets', 'write-behind persistence', 'region choice', 'async durability'],
    hints: ['ORDER BY on every request does not scale — which data structure keeps a ranking sorted on insert?', 'Redis can be the primary store for the live board; durability can be async.', 'Host it close to the players.'],
    targets: { p99: 170, availability: 0.999, budget: 15000 },
    checks: [
      { label: 'Live ranks come from Redis', why: 'Sorted sets give O(log n) inserts and rank lookups.', test: (g) => reaches(g, isK('client'), isK('cache')) },
      { label: 'Scores are persisted asynchronously', why: 'A queue/stream feeds a durable store without slowing the game.', test: (g) => reaches(g, isK('queue', 'stream'), isK('nosql', 'sql', 'globaldb', 'storage')) },
    ],
    steps: [
      { title: 'SQL with ORDER BY', why: 'Works for a demo. At 16k writes/s a single SQL primary is far past its write capacity.' },
      { title: 'Redis sorted set as the live board', why: 'ZADD / ZREVRANK are O(log n). Three Redis nodes absorb 33k ops/s with ~1 ms latency. SQL leaves the hot path.' },
      { title: 'Persist scores asynchronously', why: 'Writes also go to a stream; a stream processor batches them into DynamoDB for durability and history. The game never waits on disk.' },
      { title: 'Right-size and save', why: 'Spot stream processors, ARM for API and Redis, reserved baseline.' },
    ],
    build: (step) => {
      const { g, add, link, users, retire } = staged(step)
      const u = users('u', 1, 'Players · Seoul', 'city-seoul', 1000000, 2, 0.5, 1, 'steady')
      const lb = add(0, 'lb', 'lb', 1, 1, 'Load Balancer', { region: 'ap-northeast-1' })
      const app = add(0, 'app', 'app', 2, 1, 'Score API', (s) => ({ region: 'ap-northeast-1', autoscale: true, instances: 20, minInstances: 10, maxInstances: 120, ...(s >= 3 ? { arch: 'arm', pricing: 'reserved' } : {}) }))
      const db = add(0, 'sql', 'sql', 3, 2, 'Scores SQL', { region: 'ap-northeast-1', size: 'XL' })
      const c = add(1, 'redis', 'cache', 3, 0.5, 'Redis sorted set', (s) => ({ region: 'ap-northeast-1', instances: 3, size: 'M', ...(s >= 3 ? { arch: 'arm', pricing: 'reserved' } : {}) }))
      const q = add(2, 'q', 'stream', 3, 1.6, 'Score events', { region: 'ap-northeast-1', shards: 32 })
      const w = add(2, 'w', 'streamproc', 4, 1.6, 'Batch persister', (s) => ({ region: 'ap-northeast-1', autoscale: true, instances: 6, minInstances: 4, maxInstances: 30, ...(s >= 3 ? { pricing: 'spot' } : {}) }))
      const kv = add(2, 'kv', 'nosql', 5, 1.6, 'Score history', { region: 'ap-northeast-1', shards: 4 })
      link(u, lb)
      link(lb, app)
      link(app, db, {}, 0, 1)
      link(app, c, {}, 1)
      link(app, q, { filter: 'write', mode: 'all' }, 2)
      link(q, w, {}, 2)
      link(w, kv, {}, 2)
      retire(step >= 1, db)
      return g
    },
  },
  // ============================================================ Photo sharing
  {
    id: 'photos', title: 'Photo Sharing (Instagram)', difficulty: 'Medium', topic: 'Media & CDN',
    brief: 'Users scroll a feed of 200 KB images and upload new ones. Image bytes dominate bandwidth; uploads need thumbnails generated.',
    concepts: ['CDN for media', 'separating bytes from metadata', 'async thumbnailing', 'NoSQL feeds', 'spot workers'],
    hints: ['Where should 200 KB images be served from?', 'Thumbnails do not need to exist before the upload request returns.', 'Feed metadata is key-value shaped.'],
    targets: { p99: 260, availability: 0.999, budget: 75000 },
    checks: [
      { label: 'Images are served through a CDN', why: 'Edge caches serve repeat image views near users at tiered bandwidth prices.', test: (g) => reaches(g, isK('client'), isK('cdn')) && reaches(g, isK('cdn'), isK('storage')) },
      CHECK.queueBetween(COMPUTE, ['storage'], 'Image processing runs asynchronously', 'Resizing in the request path makes uploads slow and fragile; a queue + workers decouple it.'),
      CHECK.cacheReads('Feed reads'),
    ],
    steps: [
      { title: 'Monolith serves images and API', why: 'App servers stream every image from the bucket: huge egress through your servers and saturated instances.' },
      { title: 'CDN in front of the image bucket', why: 'Clients fetch images straight from CloudFront (90 % edge hit rate). App servers now only handle small API calls.' },
      { title: 'Feed metadata in NoSQL behind a cache', why: 'Feeds are read by key (user → posts). DynamoDB scales without sharding work; Redis serves hot feeds.' },
      { title: 'Async thumbnails', why: 'Uploads drop a job on a queue and return. Workers resize and write variants to storage.' },
      { title: 'Cost tuning', why: 'Spot workers, ARM + reserved API fleet.' },
    ],
    build: (step) => {
      const { g, add, link, users, retire } = staged(step)
      const u = users('u', 1, 'Mobile users · US', 'city-nyc', 60000, 4, 0.95, 200)
      const cdn = add(1, 'cdn', 'cdn', 1, 0, 'Image CDN', { hitRate: 0.9 })
      const lb = add(0, 'lb', 'lb', 1, 1.6, 'Load Balancer')
      const app = add(0, 'app', 'app', 2, 1.6, 'Feed API', (s) => ({ autoscale: true, instances: 8, minInstances: 4, maxInstances: 150, ...(s >= 4 ? { arch: 'arm', pricing: 'reserved' } : {}) }))
      const st = add(0, 'st', 'storage', 4, 0, 'Image bucket', { storageGB: 400000 })
      const sql = add(0, 'sql', 'sql', 3, 2.4, 'Postgres', { size: 'XL' })
      const c = add(2, 'cache', 'cache', 3, 1.2, 'Feed cache', { hitRate: 0.85 })
      const kv = add(2, 'kv', 'nosql', 4, 1.6, 'Posts & feeds', { shards: 8 })
      const q = add(3, 'q', 'queue', 3, 2.4, 'Upload jobs')
      const w = add(3, 'w', 'worker', 4, 2.4, 'Thumbnailers', (s) => ({ autoscale: true, instances: 4, minInstances: 2, maxInstances: 60, size: 'L', ...(s >= 4 ? { pricing: 'spot' } : {}) }))
      link(u, lb, { weight: 2 })
      link(u, cdn, { filter: 'read', weight: 8 }, 1)
      link(cdn, st, {}, 1)
      link(lb, app)
      link(app, st, { filter: 'read' }, 0, 1)
      link(app, sql, {}, 0, 2)
      link(app, c, { filter: 'read' }, 2)
      link(c, kv, {}, 2)
      link(app, kv, { filter: 'write' }, 2, 3)
      link(app, kv, { filter: 'write' }, 3)
      link(app, q, { filter: 'write', mode: 'all' }, 3)
      link(q, w, {}, 3)
      link(w, st, {}, 3)
      retire(step >= 2, sql)
      return g
    },
  },
  // ============================================================ Global feed
  {
    id: 'feed', title: 'Global News Feed', difficulty: 'Medium', topic: 'Multi-region',
    brief: 'Users on four continents scroll a feed. p99 must be low everywhere — not just near your first region.',
    concepts: ['GeoDNS latency routing', 'multi-region active-active', 'global databases', 'replication cost'],
    hints: ['Check each Users node in the System overview: who is slow and why?', 'GeoDNS sends each city to its nearest region once there are several.', 'A cache in Europe talking to a database in Virginia still pays the Atlantic on every miss.'],
    targets: { p99: 260, availability: 0.999, budget: 30000 },
    checks: [
      { label: 'Traffic is served from 3+ regions', why: 'Speed of light: a single region cannot give Seoul and London low latency at once.', test: (g) => new Set(K(g, ...COMPUTE).map((n) => n.data.config.region)).size >= 3 },
      { label: 'No cross-region calls on the data path', why: 'Each region reads data locally (regional store or a global database replica).', test: (g) => !g.edges.some((e) => { const s = g.nodes.find((n) => n.id === e.source); const t = g.nodes.find((n) => n.id === e.target); return !!s && !!t && s.data.kind !== 'client' && ['sql', 'nosql', 'cache', 'search'].includes(t.data.kind) && s.data.config.region !== 'global' && t.data.config.region !== 'global' && s.data.config.region !== t.data.config.region }) },
    ],
    steps: [
      { title: 'One region (Virginia)', why: 'Fine for New York; London, Karachi and Seoul pay 70–180 ms of round trips on every request.' },
      { title: 'Add Europe', why: 'GeoDNS now routes London to Frankfurt. But Frankfurt still reads from the database in Virginia on every cache miss.' },
      { title: 'Add Mumbai and Tokyo', why: 'Every user now has a nearby region for compute. Data is still remote.' },
      { title: 'Global database for local reads', why: 'A globally replicated database (DynamoDB Global Tables / Spanner / Cosmos) puts a replica in every region. Reads are local; writes replicate.' },
      { title: 'Cost tuning', why: 'ARM + reserved baselines in all four regions.' },
    ],
    build: (step) => {
      const { g, add, link, users } = staged(step)
      const cl = [
        users('nyc', 0, 'Users · New York', 'city-nyc', 100000, 6, 0.95, 5),
        users('lon', 1.1, 'Users · London', 'city-london', 80000, 6, 0.95, 5),
        users('khi', 2.2, 'Users · Karachi', 'city-karachi', 60000, 6, 0.95, 5),
        users('sel', 3.3, 'Users · Seoul', 'city-seoul', 50000, 6, 0.95, 5),
      ]
      const dns = add(0, 'dns', 'dns', 1, 1.6)
      const regions: [string, number, number, string][] = [['us-east-1', 0, 0, 'US'], ['eu-central-1', 1.1, 1, 'EU'], ['ap-south-1', 2.2, 2, 'Mumbai'], ['ap-northeast-1', 3.3, 2, 'Tokyo']]
      const gdb = add(3, 'gdb', 'globaldb', 6, 1.6, 'Global feed DB', { replicas: 4, shards: 4, consistency: 'eventual' })
      const kv = add(0, 'kv', 'nosql', 6, 0, 'Posts DB · US', { region: 'us-east-1', shards: 8 })
      regions.forEach(([r, row, from, tag]) => {
        const lb = add(from, `lb-${tag}`, 'lb', 2, row, `LB · ${tag}`, { region: r })
        const app = add(from, `app-${tag}`, 'app', 3, row, `Feed API · ${tag}`, (s) => ({ region: r, autoscale: true, instances: 4, minInstances: 2, maxInstances: 60, ...(s >= 4 ? { arch: 'arm', pricing: 'reserved' } : {}) }))
        const c = add(from, `c-${tag}`, 'cache', 4, row, `Redis · ${tag}`, (s) => ({ region: r, hitRate: 0.85, instances: 2, size: 'S', ...(s >= 4 ? { arch: 'arm' } : {}) }))
        link(dns, lb)
        link(lb, app)
        link(app, c)
        link(c, kv, {}, -1, 3)
        link(c, gdb, {}, 3)
      })
      cl.forEach((u) => link(u, dns))
      if (step >= 3) {
        // the single-region store is retired
        g.nodes = g.nodes.filter((n) => n.id !== kv)
        g.edges = g.edges.filter((e) => e.target !== kv)
      }
      return g
    },
  },
  // ============================================================ Search autocomplete
  {
    id: 'typeahead', title: 'Search Autocomplete', difficulty: 'Medium', topic: 'Low latency',
    brief: 'Every keystroke asks for suggestions: 50k requests/s, 99.9 % reads, and the answer must arrive before the next keypress.',
    concepts: ['prefix caching', 'search clusters', 'index updates via streams', 'p99 budgets'],
    hints: ['A search cluster node handles a few hundred queries/s — far too few on its own.', 'Popular prefixes repeat constantly.', 'New trending terms can reach the index asynchronously.'],
    targets: { p99: 160, availability: 0.999, budget: 16000 },
    checks: [
      CHECK.cacheReads('Prefix lookups'),
      CHECK.queueBetween(COMPUTE, ['search'], 'Index updates flow through a stream', 'Writing to the search index synchronously from the API couples latency and availability.'),
    ],
    steps: [
      { title: 'Query the search cluster directly', why: 'Three search nodes give ~1,800 queries/s. At 50k/s nearly everything is dropped.' },
      { title: 'Cache popular prefixes', why: 'A Redis prefix cache with a 92 % hit rate turns 50k/s into ~4k/s for the cluster.' },
      { title: 'Autoscale the cluster and the API', why: 'The remaining misses follow the daily curve; autoscaling sizes both tiers to the wave.' },
      { title: 'Stream index updates', why: 'New searches flow through Kinesis into a stream processor that updates term counts and the index — never on the request path.' },
      { title: 'Cost tuning', why: 'ARM + reserved for the API, reserved search nodes.' },
    ],
    build: (step) => {
      const { g, add, link, users } = staged(step)
      const u = users('u', 1, 'Searchers · SF', 'city-sf', 300000, 10, 0.999, 1)
      const lb = add(0, 'lb', 'lb', 1, 1, 'Load Balancer', { region: 'us-west-2' })
      const app = add(0, 'app', 'app', 2, 1, 'Suggest API', (s) => ({ region: 'us-west-2', latencyMs: 8, ...(s >= 2 ? { autoscale: true, instances: 30, minInstances: 10, maxInstances: 150 } : { instances: 10 }), ...(s >= 4 ? { arch: 'arm', pricing: 'reserved' } : {}) }))
      const c = add(1, 'c', 'cache', 3, 0.5, 'Prefix cache', (s) => ({ region: 'us-west-2', hitRate: 0.92, instances: 3, ...(s >= 4 ? { arch: 'arm' } : {}) }))
      const se = add(0, 'se', 'search', 4, 1, 'Suggest index', (s) => ({ region: 'us-west-2', instances: 3, latencyMs: 12, ...(s >= 2 ? { autoscale: true, minInstances: 4, maxInstances: 30 } : {}), ...(s >= 4 ? { pricing: 'reserved' } : {}) }))
      const st = add(3, 'st', 'stream', 3, 2, 'Query log', { region: 'us-west-2', shards: 2 })
      const sp = add(3, 'sp', 'streamproc', 4, 2, 'Term counter', { region: 'us-west-2', instances: 1 })
      link(u, lb)
      link(lb, app)
      link(app, se, {}, 0, 1)
      link(app, c, { filter: 'read' }, 1)
      link(c, se, {}, 1)
      link(app, se, { filter: 'write' }, 1, 3)
      link(app, st, { filter: 'write' }, 3)
      link(st, sp, {}, 3)
      link(sp, se, {}, 3)
      return g
    },
  },
  // ============================================================ Chat
  {
    id: 'chat', title: 'Chat Backend (WhatsApp)', difficulty: 'Medium', topic: 'Real-time',
    brief: 'Half a million users in Mumbai and Lahore send and receive messages. 60 % of traffic is writes; delivery must be instant.',
    concepts: ['WebSockets', 'write scaling via sharding', 'provisioned vs on-demand', 'recent-message cache'],
    hints: ['A single SQL primary has limited write capacity — only shards add write capacity.', 'Polling for new messages wastes requests; how can the server push?', 'Compare on-demand NoSQL against sharded SQL in the Cost tab.'],
    targets: { p99: 230, availability: 0.999, budget: 16000 },
    checks: [
      { label: 'Messages are pushed over a persistent connection', why: 'WebSockets remove polling and deliver in milliseconds.', test: (g) => has(g, 'websocket') && reaches(g, isK('client'), isK('websocket')) },
      { label: 'The message store scales writes', why: 'Writes need shards (SQL) or partitions (NoSQL / global DB).', test: (g) => K(g, 'sql').some((n) => n.data.config.shards >= 2) || has(g, 'nosql', 'globaldb') },
      CHECK.dbSurvivesAz(),
    ],
    steps: [
      { title: 'REST API + one SQL database', why: '13k message writes/s against ~3k/s of write capacity: most sends fail.' },
      { title: 'WebSockets for delivery', why: 'Clients hold a connection to a WebSocket gateway; the server pushes messages instead of clients polling.' },
      { title: 'Shard the message store by conversation', why: 'Four XL shards give ~25k writes/s. Multi-AZ keeps each shard alive through a zone failure.' },
      { title: 'Cache recent conversations', why: 'Opening a chat reads the last messages — a Redis cache answers most of them.' },
      { title: 'Cost tuning', why: 'Reserved database capacity (it never scales in) and ARM for the API fleet.' },
    ],
    build: (step) => {
      const { g, add, link, users } = staged(step)
      const a = users('bom', 0.5, 'Users · Mumbai', 'ap-south-1', 300000, 4, 0.4, 1, 'steady')
      const b = users('lhe', 1.6, 'Users · Lahore', 'city-lahore', 200000, 4, 0.4, 1, 'steady')
      const lb = add(0, 'lb', 'lb', 1, 1, 'Load Balancer', { region: 'ap-south-1' })
      const ws = add(1, 'ws', 'websocket', 1, 1, 'WebSocket gateway', { region: 'ap-south-1' })
      const app = add(0, 'app', 'app', 2, 1, 'Chat service', (s) => ({ region: 'ap-south-1', autoscale: true, instances: 40, minInstances: 30, maxInstances: 120, ...(s >= 4 ? { arch: 'arm', pricing: 'reserved' } : {}) }))
      const c = add(3, 'c', 'cache', 3, 0.3, 'Recent messages', { region: 'ap-south-1', hitRate: 0.8 })
      const db = add(0, 'db', 'sql', 4, 1, 'Messages', (s) => ({ region: 'ap-south-1', size: s >= 2 ? 'XL' : 'L', shards: s >= 2 ? 4 : 1, multiAz: s >= 2, ...(s >= 4 ? { pricing: 'reserved', arch: 'arm' } : {}) }))
      ;[a, b].forEach((u) => {
        link(u, lb, {}, 0, 1)
        link(u, ws, {}, 1)
      })
      link(lb, app)
      link(ws, app)
      link(app, db, {}, 0, 3)
      link(app, c, { filter: 'read' }, 3)
      link(c, db, {}, 3)
      link(app, db, { filter: 'write' }, 3)
      return g
    },
  },
  // ============================================================ Notifications
  {
    id: 'notify', title: 'Notification System', difficulty: 'Medium', topic: 'Async & fan-out',
    brief: 'Internal services fire events that become emails and push notifications. A marketing blast at noon multiplies volume ×6, and the email provider caps sends per second.',
    concepts: ['pub/sub fan-out', 'queues absorb bursts', 'provider rate limits', 'retries + circuit breakers', 'idempotency'],
    hints: ['Should the producer wait for the email provider?', 'One event, several channels: who fans it out?', 'A queue lets a 6× burst drain at the provider\'s pace.'],
    targets: { p99: 150, availability: 0.999, budget: 40000, backlogSec: 3600 },
    checks: [
      CHECK.queueBetween(COMPUTE, ['notify'], 'Producers never wait on the providers', 'A queue between your API and the providers absorbs bursts and outages.'),
      { label: 'One event fans out via pub/sub', why: 'Channels evolve independently and fail independently.', test: (g) => has(g, 'pubsub') },
      { label: 'Provider calls retry behind a circuit breaker', why: 'Retries handle blips; the breaker stops a retry storm when a provider is down.', test: (g) => g.edges.some((e) => kindOf(g, e.target) === 'notify' && (e.data?.retries ?? 0) > 0 && !!e.data?.breaker) },
    ],
    steps: [
      { title: 'Call the providers inline', why: 'The API sends email and push before replying. At the noon blast the email provider\'s limit is exceeded and producer requests fail.' },
      { title: 'Queue in front of each provider', why: 'The API enqueues and returns in milliseconds. Workers drain at the provider\'s rate; the burst becomes a backlog that clears within the hour.' },
      { title: 'Fan out with pub/sub', why: 'The API publishes one event; SNS/Pub/Sub delivers it to the email queue and the push queue independently.' },
      { title: 'Retries with a circuit breaker', why: 'Transient provider errors are retried (with idempotency keys); a breaker stops hammering a provider that is down.' },
      { title: 'Cost tuning', why: 'Workers are interruption-tolerant: run them on spot.' },
    ],
    build: (step) => {
      const { g, add, link, users } = staged(step)
      const u = users('u', 1, 'Internal services', 'us-east-1', 300, 25, 0, 1, 'spike')
      const gw = add(0, 'gw', 'gateway', 1, 1, 'Events API')
      const app = add(0, 'app', 'container', 2, 1, 'Notification service', { instances: 2, minInstances: 2, maxInstances: 20, autoscale: true })
      const ps = add(2, 'ps', 'pubsub', 3, 1, 'Events topic')
      const qe = add(1, 'qe', 'queue', 4, 0.4, 'Email queue')
      const qp = add(1, 'qp', 'queue', 4, 1.6, 'Push queue')
      const we = add(1, 'we', 'worker', 5, 0.4, 'Email senders', (s) => ({ instances: 2, size: 'S', autoscale: true, minInstances: 2, maxInstances: 10, ...(s >= 4 ? { pricing: 'spot' } : {}) }))
      const wp = add(1, 'wp', 'worker', 5, 1.6, 'Push senders', (s) => ({ instances: 2, size: 'S', autoscale: true, minInstances: 2, maxInstances: 10, ...(s >= 4 ? { pricing: 'spot' } : {}) }))
      const email = add(0, 'email', 'notify', 6, 0.4, 'Email provider (SES)', { rateLimit: 300, unitCost: 0.1, latencyMs: 120 })
      const push = add(0, 'push', 'notify', 6, 1.6, 'Push (FCM/APNs)', { rateLimit: 20000, unitCost: 0.001, latencyMs: 60 })
      link(u, gw)
      link(gw, app)
      link(app, email, { mode: 'all' }, 0, 1)
      link(app, push, { mode: 'all' }, 0, 1)
      link(app, qe, { mode: 'all' }, 1, 2)
      link(app, qp, { mode: 'all' }, 1, 2)
      link(app, ps, {}, 2)
      link(ps, qe, { mode: 'all' }, 2)
      link(ps, qp, { mode: 'all' }, 2)
      link(qe, we, {}, 1)
      link(qp, wp, {}, 1)
      link(we, email, step >= 3 ? { retries: 2, breaker: true } : {}, 1)
      link(wp, push, step >= 3 ? { retries: 2, breaker: true } : {}, 1)
      return g
    },
  },
  // ============================================================ Web crawler
  {
    id: 'crawler', title: 'Web Crawler', difficulty: 'Medium', topic: 'Async & fan-out',
    brief: 'Crawl 5,000 pages per second: fetch, store the HTML, remember what you have seen, and feed the search index.',
    concepts: ['URL frontier queue', 'worker autoscaling', 'dedupe store', 'stream processing', 'spot fleets'],
    hints: ['The frontier is a queue, not an API call.', 'Fetchers are disposable — perfect for spot.', 'Parsing and indexing can happen downstream of storage.'],
    targets: { p99: 60, availability: 0.999, budget: 20000, backlogSec: 600 },
    checks: [
      { label: 'The URL frontier is a queue', why: 'Decouples discovery from fetching and makes the system resumable.', test: (g) => reaches(g, isK('client'), isK('queue', 'stream')) && !edgeKinds(g, ['client'], [...COMPUTE, 'worker']) },
      { label: 'Seen-URL set for deduplication', why: 'Without it the crawler loops forever on the same links.', test: (g) => reaches(g, isK('worker'), isK('nosql', 'cache', 'globaldb')) },
      CHECK.autoscaled(),
    ],
    steps: [
      { title: 'A fetch API does everything', why: 'Two servers fetch, store and dedupe inline. 5,000 pages/s overwhelms them.' },
      { title: 'Frontier queue + fetcher workers', why: 'The scheduler drops URLs on SQS; an autoscaling worker fleet fetches pages and checks a Redis seen-set (SADD) before following links.' },
      { title: 'Batch pages through a stream', why: 'Fetchers publish pages to a stream; a stream processor writes them to S3 in large batches (one object per 100 pages) and updates the search index in bulk.' },
      { title: 'Spot fleet', why: 'Fetchers and processors are stateless queue consumers → spot instances at −70 %.' },
    ],
    build: (step) => {
      const { g, add, link, users } = staged(step)
      const u = users('u', 1, 'URL scheduler', 'us-east-1', 1000, 300, 0, 100, 'steady')
      const app = add(0, 'app', 'app', 1, 1, 'Fetch API', { instances: 2 })
      const q = add(1, 'q', 'queue', 1, 1, 'URL frontier')
      const w = add(1, 'w', 'worker', 2, 1, 'Fetchers', (s) => ({ autoscale: true, instances: 30, minInstances: 10, maxInstances: 120, size: 'L', ...(s >= 3 ? { pricing: 'spot', arch: 'arm' } : {}) }))
      const st = add(0, 'st', 'storage', 5, 0.3, 'Raw HTML', { storageGB: 200000 })
      const kv = add(0, 'kv', 'cache', 3, 0.2, 'Seen URLs (Redis)', { instances: 2, size: 'M' })
      const s = add(2, 's', 'stream', 3, 2.2, 'Fetched pages', { shards: 8 })
      const sp = add(2, 'sp', 'streamproc', 4, 2.2, 'Parser', (x) => ({ autoscale: true, instances: 3, minInstances: 2, maxInstances: 20, ...(x >= 3 ? { pricing: 'spot' } : {}) }))
      const se = add(2, 'se', 'search', 5, 2.2, 'Search index', { instances: 3 })
      link(u, app, {}, 0, 1)
      link(app, st, { mode: 'all' }, 0, 1)
      link(app, kv, { mode: 'all' }, 0, 1)
      link(u, q, {}, 1)
      link(q, w, {}, 1)
      link(w, st, { mode: 'all' }, 1, 2)
      link(w, kv, { mode: 'all' }, 1)
      link(w, s, { mode: 'all' }, 2)
      link(s, sp, {}, 2)
      link(sp, se, { mode: 'all' }, 2)
      link(sp, st, { mode: 'all' }, 2)
      return g
    },
  },
  // ============================================================ Metrics pipeline
  {
    id: 'metrics', title: 'Metrics & Logging Pipeline', difficulty: 'Medium', topic: 'Data pipelines',
    brief: '100k agents push 50k events/s. Engineers query dashboards. Raw data must be kept cheaply for a year.',
    concepts: ['streams vs databases', 'stream processing', 'warehouses off the hot path', 'object-storage archive'],
    hints: ['A relational database is the wrong sink for a firehose.', 'Dashboards should not scan raw rows on every page load.', 'Cold data belongs in object storage.'],
    targets: { p99: 300, availability: 0.999, budget: 37000 },
    checks: [
      { label: 'Ingestion goes through a stream', why: 'Kinesis/Kafka absorbs bursts and lets many consumers read the same data.', test: (g) => reaches(g, isK('client'), isK('stream')) },
      { label: 'Dashboards are served from a cache or rollup store', why: 'Warehouses are for ad-hoc analytics, not every page load.', test: (g) => !g.edges.some((e) => COMPUTE.includes(kindOf(g, e.source)!) && kindOf(g, e.target) === 'warehouse') },
      { label: 'Raw events archived to object storage', why: 'Pennies per GB-month versus dollars in a database.', test: (g) => reaches(g, isK('stream', 'streamproc'), isK('storage')) },
    ],
    steps: [
      { title: 'Insert every event into SQL', why: '50k inserts/s against a few thousand writes/s of capacity: almost everything fails.' },
      { title: 'Stream ingestion', why: 'Agents post to a thin ingest tier that writes to Kinesis/Kafka. A Flink job aggregates into the warehouse in batches.' },
      { title: 'Dashboards read rollups through a cache', why: 'The processor writes 1-minute rollups to a key-value store; dashboards read them via Redis instead of scanning the warehouse.' },
      { title: 'Archive raw events', why: 'The processor also writes compressed raw batches to S3 for cheap long-term retention.' },
      { title: 'Cost tuning', why: 'Stream processors on spot, ARM ingest fleet.' },
    ],
    build: (step) => {
      const { g, add, link, users, retire } = staged(step)
      const ag = users('ag', 0.6, 'Fleet agents', 'us-east-1', 100000, 30, 0, 2, 'steady')
      const en = users('en', 2.4, 'Engineers', 'city-nyc', 2000, 6, 1, 20)
      const lb = add(0, 'lb', 'lb', 1, 0.6, 'Ingest LB')
      const ing = add(0, 'ing', 'app', 2, 0.6, 'Ingest API', (s) => ({ autoscale: true, instances: 60, minInstances: 40, maxInstances: 160, size: 'M', ...(s >= 4 ? { arch: 'arm', pricing: 'reserved' } : {}) }))
      const sql = add(0, 'sql', 'sql', 4, 1.6, 'Metrics SQL', { size: 'XL' })
      const st = add(1, 'st', 'stream', 3, 0.6, 'Event stream', { shards: 80 })
      const sp = add(1, 'sp', 'streamproc', 4, 0.6, 'Aggregator', (s) => ({ autoscale: true, instances: 20, minInstances: 10, maxInstances: 60, ...(s >= 4 ? { pricing: 'spot' } : {}) }))
      const dwh = add(1, 'dwh', 'warehouse', 5, 0, 'Warehouse', { instances: 2 })
      const kv = add(2, 'kv', 'nosql', 5, 1.2, 'Rollups', { shards: 4 })
      const arc = add(3, 'arc', 'storage', 5, -0.6, 'Raw archive', { storageGB: 100000 })
      const dlb = add(0, 'dlb', 'lb', 1, 2.4, 'Dashboard LB')
      const dash = add(0, 'dash', 'app', 2, 2.4, 'Dashboard API', { instances: 2 })
      const c = add(2, 'c', 'cache', 3, 2.4, 'Query cache', { hitRate: 0.9, size: 'S' })
      link(ag, lb)
      link(lb, ing)
      link(ing, sql, {}, 0, 1)
      link(ing, st, {}, 1)
      link(st, sp, {}, 1)
      link(sp, dwh, { mode: 'all' }, 1)
      link(sp, kv, { mode: 'all' }, 2)
      link(sp, arc, { mode: 'all' }, 3)
      link(en, dlb)
      link(dlb, dash)
      link(dash, sql, {}, 0, 1)
      link(dash, dwh, {}, 1, 2)
      link(dash, c, {}, 2)
      link(c, kv, {}, 2)
      retire(step >= 1, sql)
      return g
    },
  },
  // ============================================================ Flash sale
  {
    id: 'flash', title: 'Flash Sale (E-commerce)', difficulty: 'Hard', topic: 'Spikes',
    brief: 'At 12:00 traffic jumps ×6 for 30 minutes. 30 % of requests are orders. Survive the day without overpaying for the other 23.5 hours.',
    concepts: ['autoscaling lag', 'scheduled pre-scaling', 'queue-based load levelling', 'cache the catalog', 'spot workers'],
    hints: ['Autoscaling takes ~2 minutes to react — what absorbs the first wave?', 'Orders do not have to be written synchronously.', 'Writes only scale with shards, not replicas.'],
    targets: { p99: 2500, availability: 0.995, budget: 32000 },
    checks: [
      CHECK.queueBetween(COMPUTE, ['sql', 'nosql'], 'Orders are levelled through a queue', 'The database writes at a steady pace while the queue absorbs the spike.'),
      CHECK.cacheReads('Catalog pages'),
      CHECK.dbSurvivesAz(),
    ],
    steps: [
      { title: 'Autoscaled app + SQL', why: 'Reasonable on a normal day. At 12:00 order writes swamp the database primary.' },
      { title: 'Cache the catalog', why: 'Product pages are 70 % of traffic and change rarely: a cache with a 90 % hit rate shields the database.' },
      { title: 'Queue the orders', why: 'Checkout enqueues the order and returns. Workers write at the rate the database sustains; customers get an email confirmation.' },
      { title: 'Pre-scale for the sale + Multi-AZ', why: 'Scheduled scaling raises the minimum fleet before noon so the first minute is not lost to autoscaling lag.' },
      { title: 'Cost tuning', why: 'Spot workers, reserved baseline for the API, reserved database.' },
    ],
    build: (step) => {
      const { g, add, link, users } = staged(step)
      const u = users('u', 1, 'Shoppers', 'us-east-1', 600000, 1, 0.7, 10, 'spike')
      const lb = add(0, 'lb', 'lb', 1, 1, 'Load Balancer')
      const app = add(0, 'app', 'app', 2, 1, 'Shop API', (s) => ({ autoscale: true, instances: 14, minInstances: s >= 3 ? 40 : 6, maxInstances: 200, ...(s >= 4 ? { arch: 'arm', pricing: 'reserved' } : {}) }))
      const c = add(1, 'c', 'cache', 3, 0.2, 'Catalog cache', { hitRate: 0.9, instances: 3 })
      const q = add(2, 'q', 'queue', 3, 1.8, 'Orders queue')
      const w = add(2, 'w', 'worker', 4, 1.8, 'Order workers', (s) => ({ autoscale: true, instances: 10, minInstances: 6, maxInstances: 80, size: 'L', ...(s >= 4 ? { pricing: 'spot' } : {}) }))
      const db = add(0, 'db', 'sql', 5, 1, 'Orders DB', (s) => ({ size: 'XL', replicas: 1, shards: 2, multiAz: s >= 3, ...(s >= 4 ? { pricing: 'reserved' } : {}) }))
      link(u, lb)
      link(lb, app)
      link(app, db, {}, 0, 1)
      link(app, c, { filter: 'read' }, 1)
      link(c, db, {}, 1)
      link(app, db, { filter: 'write' }, 1, 2)
      link(app, q, { filter: 'write' }, 2)
      link(q, w, {}, 2)
      link(w, db, {}, 2)
      return g
    },
  },
  // ============================================================ Ticket booking
  {
    id: 'tickets', title: 'Ticket Booking (Ticketmaster)', difficulty: 'Hard', topic: 'Consistency',
    brief: 'A stadium tour goes on sale at noon. A million fans refresh event pages; seats must never be double-booked.',
    concepts: ['ACID transactions for inventory', 'virtual waiting room', 'read/write separation', 'pre-scaling'],
    hints: ['Seat inventory needs transactions — which store gives you that?', 'Browsing and booking have very different needs; split them.', 'A waiting room (queue) protects the booking path from the spike.'],
    targets: { p99: 2500, availability: 0.995, budget: 34000 },
    checks: [
      { label: 'Seat reservations land in SQL', why: 'Row locks / SERIALIZABLE transactions prevent double booking.', test: (g) => has(g, 'sql') && reaches(g, isK('client'), isK('sql')) },
      CHECK.queueBetween(COMPUTE, ['sql'], 'Bookings go through a waiting-room queue', 'Serialises demand into the rate the inventory database can handle.'),
      CHECK.cacheReads('Event pages'),
      CHECK.dbSurvivesAz(),
    ],
    steps: [
      { title: 'App + SQL', why: 'At noon 50k req/s arrive; inventory writes overwhelm the database and errors cascade.' },
      { title: 'Cache event pages', why: 'Seat maps and event pages are cached for a few seconds; 85 % of traffic never reaches SQL.' },
      { title: 'Waiting room for bookings', why: 'Booking requests enter a queue; workers process them in order against SQL with row-level locking. No double booking, no meltdown.' },
      { title: 'Pre-scale + Multi-AZ', why: 'Raise minimum capacity before the on-sale; Multi-AZ standby for the inventory database.' },
      { title: 'Cost tuning', why: 'Reserved database and baseline, spot workers.' },
    ],
    build: (step) => {
      const { g, add, link, users } = staged(step)
      const u = users('u', 1, 'Fans', 'us-east-1', 1000000, 0.5, 0.85, 15, 'spike')
      const cdnLb = add(0, 'lb', 'lb', 1, 1, 'Load Balancer')
      const app = add(0, 'app', 'app', 2, 1, 'Events API', (s) => ({ autoscale: true, instances: 20, minInstances: s >= 3 ? 25 : 8, maxInstances: 200, ...(s >= 4 ? { arch: 'arm', pricing: 'reserved' } : {}) }))
      const c = add(1, 'c', 'cache', 3, 0.2, 'Event page cache', { hitRate: 0.9, instances: 3 })
      const q = add(2, 'q', 'queue', 3, 1.8, 'Waiting room')
      const w = add(2, 'w', 'worker', 4, 1.8, 'Booking workers', (s) => ({ autoscale: true, instances: 10, minInstances: 6, maxInstances: 60, size: 'L', ...(s >= 4 ? { pricing: 'spot' } : {}) }))
      const db = add(0, 'db', 'sql', 5, 1, 'Inventory DB', (s) => ({ size: 'XL', replicas: 2, shards: 2, multiAz: s >= 3, ...(s >= 4 ? { pricing: 'reserved' } : {}) }))
      link(u, cdnLb)
      link(cdnLb, app)
      link(app, db, {}, 0, 1)
      link(app, c, { filter: 'read' }, 1)
      link(c, db, {}, 1)
      link(app, db, { filter: 'write' }, 1, 2)
      link(app, q, { filter: 'write' }, 2)
      link(q, w, {}, 2)
      link(w, db, {}, 2)
      return g
    },
  },
  // ============================================================ Ride hailing
  {
    id: 'ride', title: 'Ride-hailing (Uber)', difficulty: 'Hard', topic: 'Geo & real-time',
    brief: '150k drivers send GPS every 4 seconds while 400k riders look for nearby cars and book trips.',
    concepts: ['separate services per access pattern', 'geo index in Redis', 'WebSockets', 'location history via streams'],
    hints: ['Driver pings are 37k writes/s that are worthless after a few seconds — do they belong in SQL?', 'Riders and drivers have very different traffic: give them different entry points.', 'Trips (money!) still need a transactional store.'],
    targets: { p99: 300, availability: 0.999, budget: 24000 },
    checks: [
      { label: 'Driver locations never hit SQL', why: 'Ephemeral, high-rate data belongs in an in-memory geo index.', test: (g) => !reaches(g, (n) => n.data.kind === 'client' && n.data.label.toLowerCase().includes('driver'), isK('sql'), notK('worker', 'queue')) },
      { label: 'Drivers stay connected over WebSockets', why: 'Dispatch offers must be pushed instantly.', test: (g) => has(g, 'websocket') },
      { label: 'Nearby-driver lookups use the geo index', why: 'GEOSEARCH in Redis answers in ~1 ms.', test: (g) => reaches(g, isK('client'), isK('cache')) },
    ],
    steps: [
      { title: 'Everything in one API and SQL', why: '37k location writes/s on top of trip traffic flatten the database.' },
      { title: 'Location service + Redis geo index', why: 'Drivers talk to a dedicated location service that writes to Redis (GEOADD). SQL now only stores trips.' },
      { title: 'WebSockets for drivers', why: 'A persistent connection carries GPS up and dispatch offers down.' },
      { title: 'Location history via a stream', why: 'Pings are also published to Kinesis; a stream processor writes them to the warehouse for ETAs and pricing models.' },
      { title: 'Cost tuning', why: 'Spot stream processors, ARM fleets, reserved baselines.' },
    ],
    build: (step) => {
      const { g, add, link, users } = staged(step)
      const dr = users('dr', 0.4, 'Drivers · NYC', 'city-nyc', 150000, 15, 0.05, 0.5, 'steady')
      const ri = users('ri', 2, 'Riders · NYC', 'city-nyc', 400000, 3, 0.8, 2)
      const lbD = add(0, 'lbd', 'lb', 1, 0.4, 'Driver LB')
      const ws = add(2, 'ws', 'websocket', 1, 0.4, 'Driver WebSockets')
      const loc = add(1, 'loc', 'app', 2, 0.4, 'Location service', (s) => ({ autoscale: true, instances: 60, minInstances: 50, maxInstances: 140, ...(s >= 4 ? { arch: 'arm', pricing: 'reserved' } : {}) }))
      const geo = add(1, 'geo', 'cache', 3, 1.2, 'Geo index (Redis)', (s) => ({ instances: 3, size: 'L', ...(s >= 4 ? { arch: 'arm', pricing: 'reserved' } : {}) }))
      const lbR = add(0, 'lbr', 'lb', 1, 2, 'Rider LB')
      const trip = add(0, 'trip', 'app', 2, 2, 'Trip service', (s) => ({ autoscale: true, instances: s === 0 ? 80 : 20, minInstances: s === 0 ? 60 : 10, maxInstances: 160, ...(s >= 4 ? { arch: 'arm', pricing: 'reserved' } : {}) }))
      const db = add(0, 'db', 'sql', 4, 2, 'Trips DB', { size: 'XL', multiAz: true, replicas: 1 })
      const st = add(3, 'st', 'stream', 3, -0.4, 'Location stream', { shards: 60 })
      const sp = add(3, 'sp', 'streamproc', 4, -0.4, 'History writer', (s) => ({ autoscale: true, instances: 20, minInstances: 10, maxInstances: 60, ...(s >= 4 ? { pricing: 'spot' } : {}) }))
      const dwh = add(3, 'dwh', 'warehouse', 5, -0.4, 'Trip analytics', { instances: 2 })
      link(dr, lbD, {}, -1, 2)
      link(dr, ws, {}, 2)
      link(lbD, trip, {}, 0, 1)
      link(lbD, loc, {}, 1, 2)
      link(ws, loc, {}, 2)
      link(loc, geo, {}, 1)
      link(loc, st, { filter: 'write', mode: 'all' }, 3)
      link(st, sp, {}, 3)
      link(sp, dwh, {}, 3)
      link(ri, lbR)
      link(lbR, trip)
      link(trip, db, {}, 0, 1)
      link(trip, geo, { filter: 'read' }, 1)
      link(trip, db, { filter: 'write' }, 1)
      return g
    },
  },
  // ============================================================ File storage
  {
    id: 'files', title: 'File Storage & Sync (Dropbox)', difficulty: 'Hard', topic: 'Media & CDN',
    brief: 'Desktop clients upload and download 500 KB file chunks and sync metadata. Bandwidth is the bill.',
    concepts: ['pre-signed direct uploads', 'separating bytes from metadata', 'CDN downloads', 'metadata in SQL'],
    hints: ['Why should file bytes pass through your servers at all?', 'Downloads of the same chunk repeat across a user\'s devices.', 'Metadata (file tree, versions) is relational.'],
    targets: { p99: 260, availability: 0.999, budget: 105000 },
    checks: [
      { label: 'File bytes bypass the app servers', why: 'Pre-signed URLs let clients talk to object storage directly — no servers sized for bandwidth.', test: (g) => reaches(g, isK('client'), isK('storage'), isK('cdn', 'edgefn')) && !reaches(g, isK(...COMPUTE), isK('storage'), notK('queue', 'worker')) },
      { label: 'Metadata lives in SQL', why: 'Folders, versions and sharing are relational and transactional.', test: (g) => has(g, 'sql') },
      CHECK.dbSurvivesAz(),
    ],
    steps: [
      { title: 'Upload and download through the app', why: 'Every byte flows through app servers: they saturate on bandwidth and you pay egress twice.' },
      { title: 'Direct-to-storage with pre-signed URLs', why: 'The API hands out signed URLs; clients upload straight to S3 and download via CloudFront. Servers handle only small metadata calls.' },
      { title: 'Metadata replicas + cache', why: 'Directory listings are read-heavy: a cache and a read replica take the load; Multi-AZ protects the primary.' },
      { title: 'Cost tuning', why: 'Smaller, ARM, reserved metadata fleet now that it no longer moves bytes.' },
    ],
    build: (step) => {
      const { g, add, link, users } = staged(step)
      const u = users('u', 1, 'Desktop clients · London', 'city-london', 50000, 1, 0.6, 500)
      const cdn = add(1, 'cdn', 'cdn', 1, 0, 'Download CDN', { hitRate: 0.6 })
      const lb = add(0, 'lb', 'lb', 1, 1.8, 'API LB', { region: 'eu-west-1' })
      const app = add(0, 'app', 'app', 2, 1.8, 'Sync API', (s) => ({ region: 'eu-west-1', autoscale: true, instances: s === 0 ? 20 : 4, minInstances: s === 0 ? 10 : 2, maxInstances: 60, ...(s >= 3 ? { arch: 'arm', pricing: 'reserved' } : {}) }))
      const st = add(0, 'st', 'storage', 3, 0.4, 'File chunks', { region: 'eu-west-1', storageGB: 3000000 })
      const c = add(2, 'c', 'cache', 3, 1.4, 'Metadata cache', { region: 'eu-west-1', hitRate: 0.8, size: 'S' })
      const db = add(0, 'db', 'sql', 4, 1.8, 'Metadata DB', (s) => ({ region: 'eu-west-1', size: 'L', replicas: s >= 2 ? 1 : 0, multiAz: s >= 2 }))
      link(u, lb, { weight: step >= 1 ? 1 : 1 })
      link(u, cdn, { filter: 'read', weight: 3 }, 1)
      link(u, st, { filter: 'write', weight: 3 }, 1)
      link(cdn, st, {}, 1)
      link(lb, app)
      link(app, st, { mode: 'all' }, 0, 1)
      link(app, db, {}, 0, 2)
      link(app, c, { filter: 'read' }, 2)
      link(c, db, {}, 2)
      link(app, db, { filter: 'write' }, 2)
      return g
    },
  },
  // ============================================================ Video streaming
  {
    id: 'video', title: 'Video Streaming (YouTube)', difficulty: 'Hard', topic: 'Media & CDN',
    brief: 'Viewers in São Paulo, Jakarta and Lagos stream 1 MB video segments. Distance sets latency; bandwidth sets the bill.',
    concepts: ['CDN offload', 'multi-region origins', 'tiered bandwidth pricing', 'bytes vs metadata'],
    hints: ['Distance to the origin dominates latency for far-away viewers.', 'A CDN geo-routes cache misses to the nearest origin when it has several.', 'Metadata and video bytes are different problems.'],
    targets: { p99: 270, availability: 0.999, budget: 140000 },
    checks: [
      { label: 'Video is served via a CDN', why: 'The only way to deliver petabytes at reasonable cost and latency.', test: (g) => reaches(g, isK('client'), isK('cdn')) },
      { label: 'Origins in 2+ regions', why: 'Cache misses are fetched from a nearby origin, not across the planet.', test: (g) => new Set(K(g, 'storage').map((n) => n.data.config.region)).size >= 2 },
    ],
    steps: [
      { title: 'Stream through the API from Virginia', why: 'Every segment crosses an ocean and passes through app servers. Slow, fragile, and egress-heavy.' },
      { title: 'CDN in front of the bucket', why: 'CloudFront serves 95 % of segments from the edge. Misses still travel to Virginia.' },
      { title: 'Origins near the viewers', why: 'Buckets replicated to São Paulo, Singapore and Cape Town: the CDN fetches misses from the closest one.' },
      { title: 'Metadata API on containers', why: 'Titles, watch history and recommendations go to a small container service with a cache and DynamoDB — separate from the byte path.' },
    ],
    build: (step) => {
      const { g, add, link, users } = staged(step)
      const cl = [
        users('sao', 0, 'Viewers · São Paulo', 'sa-east-1', 20000, 2, 0.99, 1000),
        users('jkt', 1.1, 'Viewers · Jakarta', 'city-jakarta', 20000, 2, 0.99, 1000),
        users('los', 2.2, 'Viewers · Lagos', 'city-lagos', 10000, 2, 0.99, 1000),
      ]
      const lb = add(0, 'lb', 'lb', 1, 2.8, 'API LB', { region: 'us-east-1' })
      const app = add(0, 'app', 'app', 2, 2.8, 'Video API', (s) => ({ instances: s === 0 ? 12 : 3 }))
      const cdn = add(1, 'cdn', 'cdn', 1, 1.1, 'Video CDN', { hitRate: 0.95 })
      const stUS = add(0, 'st-us', 'storage', 3, 1.1, 'Origin · Virginia', { region: 'us-east-1', storageGB: 500000 })
      const stSA = add(2, 'st-sa', 'storage', 3, 0, 'Origin · São Paulo', { region: 'sa-east-1', storageGB: 500000 })
      const stSG = add(2, 'st-sg', 'storage', 3, 2.2, 'Origin · Singapore', { region: 'ap-southeast-1', storageGB: 500000 })
      const stZA = add(2, 'st-za', 'storage', 4, 1.1, 'Origin · Cape Town', { region: 'af-south-1', storageGB: 500000 })
      const meta = add(3, 'meta', 'container', 3, 3.4, 'Catalog service', { instances: 2, minInstances: 2 })
      const kv = add(3, 'kv', 'nosql', 4, 3.4, 'Catalog', {})
      cl.forEach((u) => {
        link(u, lb, {}, 0, 1)
        link(u, cdn, { filter: 'read', weight: 19 }, 1)
        link(u, lb, { weight: 1 }, 1, 3)
      })
      link(lb, app)
      link(app, stUS, {}, 0, 3)
      link(cdn, stUS, {}, 1, 2)
      link(cdn, stSA, {}, 2)
      link(cdn, stSG, {}, 2)
      link(cdn, stZA, {}, 2)
      if (step >= 3) {
        g.nodes = g.nodes.filter((n) => n.id !== stUS && n.id !== app && n.id !== lb)
        g.edges = g.edges.filter((e) => ![stUS, app, lb].includes(e.target) && ![stUS, app, lb].includes(e.source))
        const lb2 = add(3, 'lb2', 'lb', 1, 3.4, 'API LB', { region: 'us-east-1' })
        cl.forEach((u) => link(u, lb2, { weight: 1 }, 3))
        link(lb2, meta, {}, 3)
        link(meta, kv, {}, 3)
      }
      return g
    },
  },
  // ============================================================ Payments
  {
    id: 'payments', title: 'Payment System', difficulty: 'Hard', topic: 'Reliability',
    brief: 'Checkout must charge cards through a third-party provider that is slow, rate-limited and sometimes down. Never lose or double-charge a payment.',
    concepts: ['ledger in ACID SQL', 'idempotency keys', 'async provider calls', 'retries with circuit breaker', 'Multi-AZ'],
    hints: ['Your availability cannot depend on the provider being up right now.', 'Retries without a breaker turn a provider blip into a retry storm.', 'Every request should be authenticated.'],
    targets: { p99: 260, availability: 0.9995, budget: 9000 },
    checks: [
      { label: 'Ledger in Multi-AZ SQL', why: 'Money needs transactions and zero data loss on failover.', test: (g) => K(g, 'sql').some((n) => n.data.config.multiAz) },
      CHECK.queueBetween(COMPUTE, ['external'], 'Provider calls are asynchronous', 'Checkout records intent and returns; workers charge the card and update the ledger.'),
      { label: 'Provider calls retry behind a circuit breaker', why: 'Use idempotency keys so a retried charge is never applied twice.', test: (g) => g.edges.some((e) => kindOf(g, e.target) === 'external' && (e.data?.retries ?? 0) > 0 && !!e.data?.breaker) },
      { label: 'Every request is authenticated', why: 'A payments API without auth is an incident.', test: (g) => has(g, 'auth') },
    ],
    steps: [
      { title: 'Charge inline', why: 'Checkout calls the provider synchronously: 400 ms per call, and its 1,000/s limit is below peak demand.' },
      { title: 'Ledger in Multi-AZ SQL', why: 'Payment intents are written transactionally with a synchronous standby; a replica serves reads.' },
      { title: 'Queue + workers call the provider', why: 'Checkout writes the intent and enqueues a charge job. Workers call the provider at its pace with retries (idempotency keys) and a circuit breaker.' },
      { title: 'Authenticate every request', why: 'Each call validates the user token with the identity service.' },
      { title: 'Cost tuning', why: 'Reserved ledger database and ARM workers.' },
    ],
    build: (step) => {
      const { g, add, link, users } = staged(step)
      const u = users('u', 1, 'Checkout', 'us-east-1', 200000, 1, 0.3, 2)
      const lb = add(0, 'lb', 'lb', 1, 1, 'Load Balancer')
      const app = add(0, 'app', 'container', 2, 1, 'Payments API', (s) => ({ autoscale: true, instances: 6, minInstances: 4, maxInstances: 40, ...(s >= 4 ? { arch: 'arm' } : {}) }))
      const auth = add(3, 'auth', 'auth', 3, 0, 'Identity')
      const db = add(0, 'db', 'sql', 4, 1, 'Ledger', (s) => ({ size: 'L', multiAz: s >= 1, replicas: s >= 1 ? 1 : 0, ...(s >= 4 ? { pricing: 'reserved', arch: 'arm' } : {}) }))
      const q = add(2, 'q', 'queue', 3, 2, 'Charge jobs')
      const w = add(2, 'w', 'worker', 4, 2, 'Charge workers', (s) => ({ autoscale: true, instances: 4, minInstances: 2, maxInstances: 30, ...(s >= 4 ? { arch: 'arm' } : {}) }))
      const psp = add(0, 'psp', 'external', 5, 2, 'Card processor', { rateLimit: 1000, latencyMs: 400, unitCost: 0 })
      link(u, lb)
      link(lb, app)
      link(app, auth, { mode: 'all' }, 3)
      link(app, db, { mode: 'all' })
      link(app, psp, { mode: 'all', filter: 'write' }, 0, 2)
      link(app, q, { mode: 'all', filter: 'write' }, 2)
      link(q, w, {}, 2)
      link(w, psp, { retries: 2, breaker: true }, 2)
      return g
    },
  },
  // ============================================================ LLM assistant
  {
    id: 'llm', title: 'AI Chat Assistant (LLM)', difficulty: 'Hard', topic: 'AI systems',
    brief: 'An AI assistant answers 30k users. Every LLM call costs money and takes over a second. Make it fast to start streaming and affordable to run.',
    concepts: ['token streaming over WebSockets', 'semantic caching', 'model routing (small vs large)', 'GPU vs API economics'],
    hints: ['Users judge speed by time-to-first-token, not total time.', 'Many questions repeat — can you avoid paying twice?', 'Not every prompt needs the biggest model.'],
    targets: { p99: 2700, availability: 0.999, budget: 50000 },
    checks: [
      { label: 'Responses stream over WebSockets', why: 'Tokens appear as they are generated instead of after the full answer.', test: (g) => has(g, 'websocket') },
      { label: 'A semantic cache sits in front of the model', why: 'Answering repeat questions from cache costs nothing and takes milliseconds.', test: (g) => reaches(g, isK('cache'), isK('external', 'inference')) },
      { label: 'Easy prompts are routed to a cheaper model', why: 'A small self-hosted model handles simple requests at a fraction of API cost.', test: (g) => has(g, 'inference') && has(g, 'external') },
    ],
    steps: [
      { title: 'Call the LLM API per message', why: 'Simple, but every message costs money and waits for the full completion.' },
      { title: 'Stream tokens over WebSockets', why: 'The gateway keeps a connection open and forwards tokens as they arrive — perceived latency drops to time-to-first-token.' },
      { title: 'Semantic cache', why: 'Embedding similarity on recent prompts answers ~30 % of messages from Redis — no model call at all.' },
      { title: 'Route easy prompts to a small self-hosted model', why: 'A classifier sends ~60 % of prompts to a small model on GPUs; only hard ones go to the expensive API.' },
      { title: 'Conversation history + cost tuning', why: 'Conversations stored in DynamoDB; GPU baseline reserved.' },
    ],
    build: (step) => {
      const { g, add, link, users } = staged(step)
      const u = users('u', 1, 'Users · Mumbai', 'ap-south-1', 30000, 0.5, 0.9, 4)
      const lb = add(0, 'lb', 'lb', 1, 1, 'Load Balancer', { region: 'ap-south-1' })
      const ws = add(1, 'ws', 'websocket', 1, 1, 'Streaming gateway', { region: 'ap-south-1' })
      const app = add(0, 'app', 'container', 2, 1, 'Assistant API', { region: 'ap-south-1', autoscale: true, instances: 3, minInstances: 2, maxInstances: 30 })
      const c = add(2, 'c', 'cache', 3, 0.2, 'Semantic cache', { region: 'ap-south-1', hitRate: 0.3, size: 'S' })
      const llm = add(0, 'llm', 'external', 5, 0.6, 'Frontier LLM API', { region: 'us-east-1', rateLimit: 2000, latencyMs: 1200, unitCost: 0.2 })
      const gpu = add(3, 'gpu', 'inference', 4, 1.8, 'Small model (GPU)', (s) => ({ region: 'ap-south-1', autoscale: true, instances: 6, minInstances: 3, maxInstances: 30, latencyMs: 350, ...(s >= 4 ? { pricing: 'reserved' } : {}) }))
      const kv = add(4, 'kv', 'nosql', 3, 2.6, 'Conversations', { region: 'ap-south-1' })
      link(u, lb, {}, -1, 1)
      link(u, ws, {}, 1)
      link(lb, app)
      link(ws, app)
      link(app, llm, {}, 0, 2)
      link(app, c, { weight: 4 }, 2)
      link(c, llm, {}, 2)
      link(app, gpu, { weight: 6 }, 3)
      link(app, kv, { mode: 'all', filter: 'write' }, 4)
      return g
    },
  },
  // ============================================================ IoT telemetry
  {
    id: 'telemetry', title: 'IoT Telemetry Pipeline', difficulty: 'Hard', topic: 'Data pipelines',
    brief: 'Ingest readings from 60,000 smart meters, absorb flash bursts, trigger useful analytics, and retain raw telemetry for later investigations.',
    concepts: ['ingestion rate limits', 'partitioned event streams', 'backpressure', 'batch analytics', 'object-storage retention'],
    hints: ['Do not make every device wait for an analytics query.', 'Partition the stream for peak writes, not the daily average.', 'Keep a raw archive so new analytics can replay historical events.'],
    targets: { p99: 250, availability: 0.999, budget: 30000, backlogSec: 120 },
    checks: [
      { label: 'Ingestion is rate-limited before compute', why: 'Protects the service fleet and gives operators a predictable way to shed abusive or excess traffic.', test: (g) => has(g, 'ratelimiter') && reaches(g, isK('client'), isK('ratelimiter')) },
      { label: 'Device writes enter a partitioned event stream', why: 'The stream absorbs bursts and separates device ingestion from downstream consumers.', test: (g) => K(g, 'stream').some((n) => n.data.config.shards >= 64) && reaches(g, isK('client'), isK('stream')) },
      { label: 'Analytics consumes events through a stream processor', why: 'Batching keeps warehouse writes efficient and out of the synchronous ingest path.', test: (g) => reaches(g, isK('stream'), isK('warehouse'), isK('streamproc')) },
      { label: 'Raw events are archived to object storage', why: 'A cheap immutable archive supports backfills, audits, and new analytics.', test: (g) => reaches(g, isK('stream'), isK('storage')) },
    ],
    steps: [
      { title: 'Start with synchronous writes', why: 'A single API and SQL database are easy to understand, but a flash burst overwhelms the primary and couples ingest to every downstream consumer.' },
      { title: 'Protect the ingestion tier', why: 'A gateway and rate limiter control admission while autoscaling containers absorb normal demand.' },
      { title: 'Buffer device events', why: 'A partitioned stream accepts bursts quickly and lets consumers recover independently.' },
      { title: 'Process and aggregate in batches', why: 'A stream processor batches analytics writes so the warehouse stays off the device request path.' },
      { title: 'Keep a replayable raw archive', why: 'Object storage preserves original readings for retention, investigations, and future reprocessing.' },
    ],
    build: (step) => {
      const { g, add, link, users, retire } = staged(step)
      const u = users('devices', 1, 'Smart meters', 'us-east-1', 60000, 1, 0.05, 1, 'spike')
      const app = add(0, 'ingest', 'container', 2, 1, 'Telemetry ingest', (s) => ({
        instances: s >= 1 ? 12 : 2,
        size: s >= 1 ? 'L' : 'M',
        autoscale: s >= 1,
        minInstances: s >= 1 ? 6 : 1,
        maxInstances: 48,
        ...(s >= 4 ? { arch: 'arm', pricing: 'reserved' } : {}),
      }))
      const db = add(0, 'db', 'sql', 4, 1, 'Telemetry SQL', { size: 'L' })
      const gateway = add(1, 'gateway', 'gateway', 1, 1, 'Ingestion gateway')
      const limiter = add(1, 'limit', 'ratelimiter', 2, 1, 'Device rate limit', { rateLimit: 50000 })
      const stream = add(2, 'events', 'stream', 4, 1, 'Meter events', { shards: 64 })
      const processor = add(3, 'processor', 'streamproc', 5, 1, 'Telemetry processor', {
        instances: 24, size: 'M', autoscale: true, minInstances: 12, maxInstances: 60,
        ...(step >= 4 ? { arch: 'arm', pricing: 'reserved' } : {}),
      })
      const warehouse = add(4, 'warehouse', 'warehouse', 7, 0, 'Analytics warehouse', { instances: 2, size: 'L', storageGB: 8000 })
      const archive = add(4, 'archive', 'storage', 6, 2, 'Raw event archive', { storageGB: 50000 })
      if (step >= 2) retire(true, db)
      link(u, app, {}, 0, 1)
      link(u, gateway, {}, 1)
      link(gateway, limiter, {}, 1)
      link(limiter, app, {}, 1)
      link(app, db, {}, 0, 2)
      link(app, stream, { filter: 'write' }, 2)
      link(stream, processor, {}, 3)
      link(processor, warehouse, {}, 4)
      link(stream, archive, { mode: 'all' }, 4)
      return g
    },
  },
  // ============================================================ collaborative whiteboard
  {
    id: 'collab', title: 'Live Collaborative Whiteboard', difficulty: 'Hard', topic: 'Real-time',
    brief: 'Let teams in North America and Europe edit shared boards together. Keep interactions responsive, preserve concurrent updates, and keep collaborators in sync through regional failures.',
    concepts: ['multi-region routing', 'WebSockets', 'Pub/Sub fan-out', 'regional caches', 'conflict-aware persistence'],
    hints: ['A normal request/response API is not enough to push edits to collaborators.', 'Use a fan-out path for live updates; do not make every socket poll the database.', 'Strong cross-region writes cost latency. Choose consistency intentionally and explain the trade-off.'],
    targets: { p99: 500, availability: 0.999, budget: 24000 },
    checks: [
      { label: 'Both user populations use GeoDNS', why: 'Each team should reach its nearest healthy regional entry point.', test: (g) => K(g, 'client').length >= 2 && has(g, 'dns') && reaches(g, isK('client'), isK('dns')) },
      { label: 'Live edits fan out from Pub/Sub to WebSockets', why: 'A publish/subscribe path distributes edits to connected collaborators without polling.', test: (g) => g.edges.some((e) => kindOf(g, e.source) === 'pubsub' && kindOf(g, e.target) === 'websocket' && e.data?.mode === 'all') },
      { label: 'Each region has a cache for board reads', why: 'Regional caches reduce repeated read latency while the durable store remains authoritative.', test: (g) => K(g, 'cache').length >= 2 && g.edges.filter((e) => e.data?.filter === 'read' && kindOf(g, e.target) === 'cache').length >= 2 },
      { label: 'Shared state uses a multi-region database', why: 'Concurrent edits must converge across regions; the consistency choice should be explicit.', test: (g) => K(g, 'globaldb').some((n) => n.data.config.replicas >= 2 && n.data.config.consistency === 'strong') },
      { label: 'Regional application tiers autoscale', why: 'A busy collaboration session should not overload one fixed application fleet.', test: (g) => K(g, 'app', 'container', 'k8s').filter((n) => n.data.config.autoscale).length >= 2 },
    ],
    steps: [
      { title: 'Prototype in one region', why: 'One application and database are a useful baseline, but distant users pay cross-continent latency and the region is a single point of failure.' },
      { title: 'Route teams to regional app tiers', why: 'GeoDNS sends users to nearby healthy regions and separates regional compute capacity.' },
      { title: 'Keep collaborators live', why: 'WebSockets maintain active sessions; Pub/Sub fans each edit out to connected collaborators instead of making them poll.' },
      { title: 'Cache reads and persist shared state globally', why: 'Regional caches accelerate board reads. A strongly consistent multi-region database prevents conflicting edits from silently diverging, at the cost of slower writes.' },
      { title: 'Scale and right-size the regional fleets', why: 'Autoscaling absorbs busy sessions while ARM and reserved baselines reduce the cost of steady traffic.' },
    ],
    build: (step) => {
      const { g, add, link, users, retire } = staged(step)
      const us = users('users-us', 0, 'Teams · New York', 'city-nyc', 120000, 2.5, 0.8, 8)
      const eu = users('users-eu', 2, 'Teams · London', 'city-london', 90000, 2.5, 0.8, 8)
      const dns = add(1, 'dns', 'dns', 1, 1, 'GeoDNS')
      const lbUS = add(1, 'lb-us', 'lb', 2, 0, 'US load balancer', { region: 'us-east-1' })
      const lbEU = add(1, 'lb-eu', 'lb', 2, 2, 'EU load balancer', { region: 'eu-central-1' })
      const appUS = add(0, 'app-us', 'app', 3, 0, 'Board API · US', (s) => ({
        region: 'us-east-1', instances: s >= 4 ? 12 : 4, size: 'M', autoscale: s >= 1,
        minInstances: s >= 4 ? 6 : 2, maxInstances: 40,
        ...(s >= 4 ? { arch: 'arm', pricing: 'reserved' } : {}),
      }))
      const appEU = add(1, 'app-eu', 'app', 3, 2, 'Board API · EU', (s) => ({
        region: 'eu-central-1', instances: s >= 4 ? 12 : 4, size: 'M', autoscale: s >= 1,
        minInstances: s >= 4 ? 6 : 2, maxInstances: 40,
        ...(s >= 4 ? { arch: 'arm', pricing: 'reserved' } : {}),
      }))
      const sql = add(0, 'sql', 'sql', 5, 1, 'Boards SQL', { region: 'us-east-1', size: 'L' })
      const cacheUS = add(2, 'cache-us', 'cache', 4, 0, 'Board cache · US', { region: 'us-east-1', hitRate: 0.8, instances: 2 })
      const cacheEU = add(2, 'cache-eu', 'cache', 4, 2, 'Board cache · EU', { region: 'eu-central-1', hitRate: 0.8, instances: 2 })
      const pubsub = add(2, 'updates', 'pubsub', 5, 3, 'Board updates')
      const wsUS = add(2, 'ws-us', 'websocket', 6, 2, 'Live sessions · US', { region: 'us-east-1', instances: 4, autoscale: true, minInstances: 2, maxInstances: 30 })
      const wsEU = add(2, 'ws-eu', 'websocket', 6, 3, 'Live sessions · EU', { region: 'eu-central-1', instances: 4, autoscale: true, minInstances: 2, maxInstances: 30 })
      const globalDB = add(3, 'global-db', 'globaldb', 6, 1, 'Shared board state', { replicas: 3, shards: 4, consistency: 'strong' })
      if (step >= 3) retire(true, sql)

      if (step < 1) {
        link(us, appUS)
        link(eu, appUS)
      } else {
        link(us, dns)
        link(eu, dns)
        link(dns, lbUS)
        link(dns, lbEU)
        link(lbUS, appUS)
        link(lbEU, appEU)
      }
      link(appUS, sql, {}, 0, 3)
      link(appEU, sql, {}, 1, 3)
      link(appUS, cacheUS, { filter: 'read' }, 2)
      link(appEU, cacheEU, { filter: 'read' }, 2)
      link(cacheUS, sql, {}, 2, 3)
      link(cacheEU, sql, {}, 2, 3)
      link(appUS, globalDB, { filter: 'write' }, 3)
      link(appEU, globalDB, { filter: 'write' }, 3)
      link(cacheUS, globalDB, {}, 3)
      link(cacheEU, globalDB, {}, 3)
      link(appUS, pubsub, { mode: 'all', filter: 'write' }, 2)
      link(appEU, pubsub, { mode: 'all', filter: 'write' }, 2)
      link(pubsub, wsUS, { mode: 'all' }, 2)
      link(pubsub, wsEU, { mode: 'all' }, 2)
      return g
    },
  },
]

CHALLENGES.push(...EXTRA_PROBLEMS.map(compileSpec))

export const TOPICS = [...new Set(CHALLENGES.map((c) => c.topic))]

// ------------------------------------------------------------------ registry
/** Challenges made in the editor or opened from a link, kept in this browser. */
let custom: Challenge[] = []

export function setCustomChallenges(specs: import('./spec').ChallengeSpec[]) {
  custom = specs.map((s) => ({ ...compileSpec(s), author: s.author ?? 'You' }))
}
export const customChallenges = () => custom
export const allChallenges = () => [...CHALLENGES, ...custom]
export const findChallenge = (id: string | null | undefined) => (id ? CHALLENGES.find((c) => c.id === id) ?? custom.find((c) => c.id === id) : undefined)
