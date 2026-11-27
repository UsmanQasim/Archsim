/**
 * The Learn track: short lessons, each a few steps on a live board.
 * A step can load a board and set a task; the task's check runs against the
 * live simulation, so the lesson moves on when the learner has actually fixed it.
 */
import { buildFromSpec, type SpecEdge, type SpecNode } from './sim/spec'
import type { Graph } from './sim/scenarios'
import type { Chaos, GraphEdge, GraphNode, NodeConfig, NodeKind, Pattern, SimResult } from './sim/types'

type Ctx = { nodes: GraphNode[]; edges: GraphEdge[]; result: SimResult; chaos: Chaos }

export interface LessonStep {
  title: string
  /** paragraphs */
  text: string[]
  /** the one sentence to take away from this step */
  idea?: string
  board?: () => Graph
  task?: { prompt: string; done: (c: Ctx) => boolean; success: string }
}

export interface Lesson {
  id: string
  title: string
  summary: string
  minutes: number
  concept: string
  level?: 'Beginner' | 'Intermediate' | 'Advanced'
  /** what the learner can do afterwards */
  outcomes?: string[]
  steps: LessonStep[]
}

export interface Module {
  id: string
  title: string
  /** pastel family colour, as a CSS variable name */
  color: string
  lessons: string[]
}

const U = (key: string, row: number, label: string, region: string, users: number, rpm: number, read: number, kb: number, pattern: Pattern = 'steady'): SpecNode =>
  ({ key, kind: 'client', label, col: 0, row, config: { region, users, reqPerUserMin: rpm, readRatio: read, payloadKB: kb, pattern } })
const N = (key: string, kind: NodeKind, col: number, row: number, label: string, config: Partial<NodeConfig> = {}): SpecNode =>
  ({ key, kind, col, row, label, config, from: -1 })
const E = (a: string, b: string, o: Partial<SpecEdge> = {}): SpecEdge => ({ a, b, ...o })
const board = (nodes: SpecNode[], edges: SpecEdge[]) => () => buildFromSpec({ nodes, edges }, -1)

const ofKind = (c: Ctx, ...k: NodeKind[]) => c.nodes.filter((n) => k.includes(n.data.kind))
const util = (c: Ctx, n: GraphNode) => c.result.nodes[n.id]?.util ?? 0
const avail = (c: Ctx) => c.result.totals.availability
const p99 = (c: Ctx) => c.result.totals.p99

export const LESSONS: Lesson[] = [
  {
    id: 'latency', title: 'Distance is latency', concept: 'Network latency', minutes: 3,
    summary: 'Why a server on the other side of the world feels slow, however fast it is.',
    steps: [
      {
        title: 'Light is not instant',
        text: [
          'A request travels through fibre at about two thirds of the speed of light. That is roughly 1 ms of round trip for every 100 km.',
          'On this board, users in Sydney call a server in Virginia, about 16,000 km away. Look at their latency on the Users box: most of it is the trip, not the server.',
        ],
        board: board(
          [U('u', 1, 'Users · Sydney', 'ap-southeast-2', 20000, 6, 0.9, 10), N('lb', 'lb', 1, 1, 'Load Balancer', { region: 'us-east-1' }), N('app', 'app', 2, 1, 'API', { region: 'us-east-1', instances: 6 }), N('db', 'nosql', 3, 1, 'Data', { region: 'us-east-1' })],
          [E('u', 'lb'), E('lb', 'app'), E('app', 'db')],
        ),
      },
      {
        title: 'Move it closer',
        text: ['Click each component and change its Region to Sydney (ap-southeast-2). Change all three, so the API is not calling across the ocean either.'],
        task: { prompt: 'Get p99 latency under 100 ms.', done: (c) => p99(c) < 100 && c.result.totals.offered > 0, success: 'Same servers, a tenth of the latency. Where you run matters as much as what you run.' },
      },
      {
        title: 'What to remember',
        text: ['Put compute and data near your users. When users are everywhere, use several regions or a CDN at the edge. The Global read-heavy feed template shows both.'],
      },
    ],
  },
  {
    id: 'scaling', title: 'Scaling out', concept: 'Load balancing', minutes: 4,
    summary: 'One server has a ceiling. Many servers behind a load balancer do not.',
    steps: [
      {
        title: 'One box, too much traffic',
        text: [
          'Each app server handles about 400 requests a second at size S. These users send about 3,300 a second at peak.',
          'Watch the API box turn red and the success rate fall. Requests that do not fit are dropped.',
        ],
        board: board(
          [U('u', 1, 'Users', 'city-nyc', 200000, 1, 0.9, 10), N('app', 'app', 1, 1, 'API', { instances: 1 }), N('db', 'nosql', 2, 1, 'Data')],
          [E('u', 'app'), E('app', 'db')],
        ),
      },
      {
        title: 'Add servers behind a load balancer',
        text: ['Add a Load Balancer between the users and the API (Ctrl K, then type "load"). Then select the API and raise Instances, or turn on Autoscaling.'],
        task: {
          prompt: 'Reach 99.9% success with a load balancer in front.',
          done: (c) => avail(c) >= 0.999 && ofKind(c, 'lb', 'gateway').length > 0,
          success: 'The load balancer spreads requests and skips dead servers. Adding capacity is now a number, not a rewrite.',
        },
      },
      {
        title: 'What to remember',
        text: ['Keep servers stateless so any of them can take any request. Then scaling is just adding more, and autoscaling does it for you as the day goes up and down.'],
      },
    ],
  },
  {
    id: 'caching', title: 'Caching', concept: 'Caching', minutes: 4,
    summary: 'Answer the same question once, then serve it from memory.',
    steps: [
      {
        title: 'The database is the bottleneck',
        text: ['This product page is read 50 times for every write. Every read goes to Postgres, which is past its limit.'],
        board: board(
          [U('u', 1, 'Shoppers', 'city-nyc', 300000, 1, 0.98, 10), N('lb', 'lb', 1, 1, 'Load Balancer'), N('app', 'app', 2, 1, 'API', { instances: 20 }), N('db', 'sql', 4, 1, 'Postgres', { size: 'M' })],
          [E('u', 'lb'), E('lb', 'app'), E('app', 'db')],
        ),
      },
      {
        title: 'Put a cache in front',
        text: [
          'Add a Redis cache. Connect API → Redis and Redis → Postgres. Then click the API → Postgres connection and set it to carry Writes only, so reads go through the cache.',
        ],
        task: {
          prompt: 'Get Postgres under 60% busy.',
          done: (c) => ofKind(c, 'cache').length > 0 && ofKind(c, 'sql').every((n) => util(c, n) < 0.6),
          success: 'Most reads never reach the database now. That is also why the cache\'s hit rate is the number to watch.',
        },
      },
      {
        title: 'What to remember',
        text: ['Caches trade freshness for speed. Decide how stale a read may be, set expiry to match, and remember that a cold or flushed cache sends everything to the database at once. Try Break it → Empty every cache to see it.'],
      },
    ],
  },
  {
    id: 'replication', title: 'Surviving a zone outage', concept: 'Replication', minutes: 3,
    summary: 'A database in one place is one failure away from an outage.',
    steps: [
      {
        title: 'Lose a zone',
        text: ['Open Break it above the board and choose Lose a zone (USE). The single-zone database dies and takes everything with it.'],
        board: board(
          [U('u', 1, 'Users', 'city-nyc', 100000, 3, 0.9, 10), N('lb', 'lb', 1, 1, 'Load Balancer'), N('app', 'app', 2, 1, 'API', { instances: 6 }), N('db', 'sql', 3, 1, 'Postgres', { size: 'M' })],
          [E('u', 'lb'), E('lb', 'app'), E('app', 'db')],
        ),
        task: { prompt: 'Take zone USE offline.', done: (c) => (c.chaos.failedAZs ?? []).length > 0, success: 'Everything failed, because the only copy of the data was in that zone.' },
      },
      {
        title: 'Add a standby',
        text: ['Keep the zone offline. Select Postgres and turn on Multi-AZ, which keeps a synchronous standby in another zone.'],
        task: { prompt: 'Get back to 99.9% success with the zone still down.', done: (c) => (c.chaos.failedAZs ?? []).length > 0 && avail(c) >= 0.999, success: 'The standby took over. It costs about twice as much, which is the price of not having this outage.' },
      },
      { title: 'What to remember', text: ['Every component needs an answer to "what if this disappears?". For servers it is more than one instance; for databases it is replicas or Multi-AZ; for whole regions it is a second region.'] },
    ],
  },
  {
    id: 'queues', title: 'Queues absorb spikes', concept: 'Async processing', minutes: 4,
    summary: 'Let the slow part work at its own pace.',
    steps: [
      {
        title: 'A flash sale',
        text: ['At noon traffic jumps six times. Orders are written straight to the database, which cannot keep up, so orders fail during the spike.', 'Press Play and watch around 12:00, or drag the time slider above the board.'],
        board: board(
          [U('u', 1, 'Shoppers', 'city-nyc', 200000, 1, 0.3, 4, 'spike'), N('lb', 'lb', 1, 1, 'Load Balancer'), N('app', 'app', 2, 1, 'Shop API', { autoscale: true, instances: 20, minInstances: 20, maxInstances: 200 }), N('db', 'sql', 4, 1, 'Orders DB', { size: 'L' })],
          [E('u', 'lb'), E('lb', 'app'), E('app', 'db')],
        ),
      },
      {
        title: 'Queue the writes',
        text: ['Add a Message Queue and Workers. Connect API → Queue (writes only), Queue → Workers, Workers → Orders DB, and set the API → Orders DB connection to Reads only.'],
        task: {
          prompt: 'Route writes through a queue to workers.',
          done: (c) => ofKind(c, 'queue', 'stream').length > 0 && ofKind(c, 'worker').length > 0 && !c.edges.some((e) => e.data?.filter !== 'read' && c.nodes.find((n) => n.id === e.source)?.data.kind === 'app' && c.nodes.find((n) => n.id === e.target)?.data.kind === 'sql'),
          success: 'The API accepts every order instantly; workers drain the queue as fast as the database allows. A backlog during the spike is fine.',
        },
      },
      { title: 'What to remember', text: ['Queues turn "fail now" into "finish a bit later". Use them when the caller does not need the answer right away: orders, emails, thumbnails, reports. Watch backlog age, not just length.'] },
    ],
  },
  {
    id: 'sharding', title: 'Sharding writes', concept: 'Partitioning', minutes: 3,
    summary: 'When one database cannot take the writes, split the data.',
    steps: [
      {
        title: 'Too many writes',
        text: ['Replicas help reads, but every write still goes to one primary. This one is overloaded by game events.'],
        board: board(
          [U('u', 1, 'Players', 'ap-northeast-1', 400000, 2, 0.2, 2), N('lb', 'lb', 1, 1, 'Load Balancer', { region: 'ap-northeast-1' }), N('app', 'app', 2, 1, 'Game API', { region: 'ap-northeast-1', instances: 40 }), N('db', 'sql', 3, 1, 'Events DB', { region: 'ap-northeast-1', size: 'XL' })],
          [E('u', 'lb'), E('lb', 'app'), E('app', 'db')],
        ),
      },
      {
        title: 'Split the data',
        text: ['Select the database and raise Shards. Each shard holds part of the keys and takes its share of writes. Or replace it with a NoSQL store, which shards for you.'],
        task: { prompt: 'Get every database under 70% busy.', done: (c) => ofKind(c, 'sql', 'nosql', 'globaldb').length > 0 && ofKind(c, 'sql', 'nosql', 'globaldb').every((n) => util(c, n) < 0.7), success: 'Writes are spread across shards. The cost is that queries across shards get harder, so pick a key that keeps related data together.' },
      },
      { title: 'What to remember', text: ['Shard by the key you look things up by most, such as user id. Watch for hot keys: one celebrity can still overload a single shard, which is where a cache helps.'] },
    ],
  },
  {
    id: 'cdn', title: 'CDNs carry the bytes', concept: 'Content delivery', minutes: 3,
    summary: 'Big files from your own servers are slow and expensive.',
    steps: [
      {
        title: 'Serving video from the origin',
        text: ['Every video byte flows through your servers and out of your region. Look at Per month above the board: most of it is data transfer.'],
        board: board(
          [U('u', 1, 'Viewers', 'city-london', 100000, 1, 1, 3000), N('lb', 'lb', 1, 1, 'Load Balancer', { region: 'us-east-1' }), N('app', 'app', 2, 1, 'Media API', { region: 'us-east-1', instances: 30 }), N('s3', 'storage', 3, 1, 'Videos', { region: 'us-east-1' })],
          [E('u', 'lb'), E('lb', 'app'), E('app', 's3')],
        ),
      },
      {
        title: 'Put a CDN in front',
        text: ['Add a CDN and connect Users → CDN → Videos (object storage). Remove the path through your servers for video.'],
        task: { prompt: 'Serve users through a CDN and get p99 under 150 ms.', done: (c) => ofKind(c, 'cdn').length > 0 && p99(c) < 150, success: 'Edge locations near viewers answer most requests; your region only sends each file once.' },
      },
      { title: 'What to remember', text: ['Anything big and shared, such as images, video, downloads and static pages, belongs on a CDN. Your servers should handle small, personal, dynamic requests.'] },
    ],
  },
  {
    id: 'retries', title: 'Retry storms', concept: 'Resilience', minutes: 4,
    summary: 'Retries help with blips and make overloads much worse.',
    steps: [
      {
        title: 'Three retries on every call',
        text: ['The API retries failed database calls three times. Open Break it above the board and set Traffic to ×2.', 'The database was a little short of capacity; now every failure comes back up to four times, and nearly nothing succeeds.'],
        board: board(
          [U('u', 1, 'Users', 'city-nyc', 150000, 2, 0.8, 5), N('lb', 'lb', 1, 1, 'Load Balancer'), N('app', 'app', 2, 1, 'API', { instances: 30 }), N('db', 'sql', 3, 1, 'Postgres', { size: 'L' })],
          [E('u', 'lb'), E('lb', 'app'), E('app', 'db', { retries: 3 })],
        ),
      },
      {
        title: 'Break the loop',
        text: ['Click the API → Postgres connection and turn on the circuit breaker, or lower the retries. Keep the surge on.'],
        task: { prompt: 'Turn on the breaker or cut retries to 1 or fewer.', done: (c) => c.edges.every((e) => (e.data?.retries ?? 0) <= 1 || e.data?.breaker), success: 'The breaker stops retrying a target that is mostly failing, so it gets a chance to recover instead of drowning.' },
      },
      { title: 'What to remember', text: ['Retry with backoff and jitter, cap the attempts, and use circuit breakers. Make writes idempotent so a retried request is never applied twice.'] },
    ],
  },
]

// ---------------------------------------------------------------- course structure
const META: Record<string, { level: Lesson['level']; outcomes: string[]; ideas: (string | undefined)[] }> = {
  latency: {
    level: 'Beginner',
    outcomes: ['Why distance adds latency, however fast the server is', 'Roughly how many milliseconds an ocean costs', 'Why compute and data should sit near users'],
    ideas: ['Every request is a round trip. Light in fibre covers about 100 km per millisecond there and back.', 'Moving the servers is often the biggest speed-up you can make.', undefined],
  },
  scaling: {
    level: 'Beginner',
    outcomes: ['What a single server can and cannot carry', 'What a load balancer does', 'Why stateless servers make scaling easy'],
    ideas: ['A server has a ceiling. Past it, requests queue up and then get dropped.', 'Scale out: more identical servers behind a load balancer.', undefined],
  },
  caching: {
    level: 'Beginner',
    outcomes: ['How a cache takes load off a database', 'Why the hit rate is the number to watch', 'What happens when a cache goes cold'],
    ideas: ['Read-heavy data is usually asked for again and again.', 'A cache answers repeated reads from memory in about a millisecond.', undefined],
  },
  replication: {
    level: 'Intermediate',
    outcomes: ['What an availability zone is', 'How a standby keeps a database up', 'What redundancy costs'],
    ideas: ['One copy of anything is a single point of failure.', 'A synchronous standby in another zone takes over in seconds.', undefined],
  },
  queues: {
    level: 'Intermediate',
    outcomes: ['How a queue turns a spike into a backlog', 'When work can be done later', 'Why backlog age matters more than length'],
    ideas: ['Spikes are short. Databases cannot grow in seconds.', 'Accept now, process soon: the queue absorbs the burst.', undefined],
  },
  sharding: {
    level: 'Intermediate',
    outcomes: ['Why replicas do not help writes', 'How sharding spreads writes', 'How to pick a shard key'],
    ideas: ['Every write goes to the primary, however many replicas you add.', 'Split the data so each shard takes a share of the writes.', undefined],
  },
  cdn: {
    level: 'Beginner',
    outcomes: ['Why big files should not come from your servers', 'How a CDN cuts both latency and cost', 'What belongs on a CDN'],
    ideas: ['Data transfer out of the cloud is billed per gigabyte, and video is a lot of gigabytes.', 'Edge locations near viewers serve the copies; your origin sends each file once.', undefined],
  },
  retries: {
    level: 'Advanced',
    outcomes: ['How retries multiply load on a struggling service', 'What a circuit breaker does', 'How to retry safely'],
    ideas: ['Each retry is another request on a target that is already failing.', 'A breaker stops calling a target that is mostly failing, so it can recover.', undefined],
  },
}
for (const l of LESSONS) {
  const m = META[l.id]
  if (!m) continue
  l.level ??= m.level
  l.outcomes ??= m.outcomes
  l.steps.forEach((s, i) => (s.idea ??= m.ideas[i]))
}

export const MODULES: Module[] = [
  { id: 'foundations', title: 'Foundations', color: '--cat-traffic', lessons: ['latency', 'scaling'] },
  { id: 'data', title: 'Data', color: '--cat-data', lessons: ['caching', 'sharding'] },
  { id: 'reliability', title: 'Reliability', color: '--cat-messaging', lessons: ['replication', 'retries'] },
  { id: 'async', title: 'Async and edge', color: '--cat-edge', lessons: ['queues', 'cdn'] },
]

export const lessonModule = (id: string) => MODULES.find((m) => m.lessons.includes(id))
export const LESSON_ORDER = MODULES.flatMap((m) => m.lessons)
