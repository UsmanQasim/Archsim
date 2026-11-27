import type { NodeConfig, NodeKind, Provider, SizeKey } from './types'

export type Category = 'Traffic' | 'Edge' | 'Compute' | 'Data' | 'Messaging' | 'Analytics & AI' | 'External'

export type FieldKey = keyof NodeConfig

export interface KindDef {
  kind: NodeKind
  label: string
  /** 2-3 char glyph for compact UI */
  glyph: string
  category: Category
  color: string
  desc: string
  /** real products per cloud */
  providers: Record<Provider, string>
  /** when to reach for it */
  when: string
  /** what it costs you (money, complexity, consistency) */
  tradeoffs: string
  /** lives at the edge everywhere (no single region) */
  global?: boolean
  /** has no downstream (no output port) */
  terminal?: boolean
  /** capacity scales with instance count & size */
  scalable?: boolean
  autoscalable?: boolean
  /** requests/sec one size-S instance (or the managed service) can serve */
  baseCap: number
  /** separate write capacity (databases) */
  baseWriteCap?: number
  /** instance-hour price multiplier over a general-purpose VM of the same size */
  priceMult?: number
  /** supports reserved/spot pricing & ARM */
  pricingLevers?: boolean
  armCapable?: boolean
  fields: FieldKey[]
  fieldLabels?: Partial<Record<FieldKey, string>>
  defaults: Partial<NodeConfig>
  /** asynchronous boundary: producer latency stops here */
  async?: boolean
}

export const SIZES: Record<SizeKey, { mult: number; hourly: number; label: string }> = {
  S: { mult: 1, hourly: 0.05, label: 'S · 2 vCPU / 4 GB' },
  M: { mult: 2, hourly: 0.1, label: 'M · 4 vCPU / 8 GB' },
  L: { mult: 4, hourly: 0.2, label: 'L · 8 vCPU / 16 GB' },
  XL: { mult: 8, hourly: 0.4, label: 'XL · 16 vCPU / 32 GB' },
}

export const PRICING_FACTOR = { ondemand: 1, reserved: 0.6, spot: 0.3 } as const
export const ARM_FACTOR = 0.8
/** spot capacity is occasionally reclaimed */
export const SPOT_CAPACITY = 0.92

export const PROVIDERS: { id: Provider; label: string }[] = [
  { id: 'aws', label: 'AWS' },
  { id: 'gcp', label: 'Google Cloud' },
  { id: 'azure', label: 'Azure' },
]

const BIG = 1e9
const COMPUTE_FIELDS: FieldKey[] = ['region', 'size', 'instances', 'autoscale', 'minInstances', 'maxInstances', 'pricing', 'arch', 'latencyMs']

export const CATALOG: Record<NodeKind, KindDef> = {
  client: {
    kind: 'client', label: 'Users', glyph: 'USR', category: 'Traffic', color: '#3A7CA5',
    desc: 'A population of users (or devices, services) in one place generating requests.',
    providers: { aws: 'Users / devices', gcp: 'Users / devices', azure: 'Users / devices' },
    when: 'Every design starts here. Use one node per geography or per behaviour (riders vs drivers, viewers vs uploaders).',
    tradeoffs: 'Read share, payload size and traffic shape drive almost every other decision.',
    baseCap: BIG,
    fields: ['region', 'users', 'reqPerUserMin', 'readRatio', 'payloadKB', 'pattern'],
    defaults: { region: 'us-east-1', users: 50000, reqPerUserMin: 6, readRatio: 0.9, payloadKB: 20, pattern: 'daily' },
  },
  // ---------------------------------------------------------------- edge
  dns: {
    kind: 'dns', label: 'GeoDNS', glyph: 'DNS', category: 'Edge', color: '#6B5BB5', global: true,
    desc: 'Resolves your domain and sends each user to the nearest healthy region.',
    providers: { aws: 'Route 53 (latency routing)', gcp: 'Cloud DNS', azure: 'Azure DNS + Traffic Manager' },
    when: 'Any multi-region design, or to fail over away from a dead region.',
    tradeoffs: 'Failover speed is limited by DNS TTLs; clients cache answers.',
    baseCap: BIG, fields: ['latencyMs'], defaults: { latencyMs: 2 },
  },
  cdn: {
    kind: 'cdn', label: 'CDN', glyph: 'CDN', category: 'Edge', color: '#7E57C2', global: true,
    desc: 'Edge caches near users. Serves cached reads (static assets, media) without touching your origin.',
    providers: { aws: 'CloudFront', gcp: 'Cloud CDN', azure: 'Azure Front Door' },
    when: 'Static assets, images, video, public API responses that can be cached for seconds or more.',
    tradeoffs: 'Per-request fees add up on tiny uncacheable API calls; invalidation is slow. Big win on bandwidth-heavy traffic.',
    baseCap: BIG, fields: ['hitRate', 'latencyMs'], defaults: { hitRate: 0.85, latencyMs: 10 },
  },
  edgefn: {
    kind: 'edgefn', label: 'Edge Functions', glyph: 'EDG', category: 'Edge', color: '#8B5CC0', global: true,
    desc: 'Tiny functions running in CDN locations: redirects, auth checks, A/B routing, personalisation.',
    providers: { aws: 'CloudFront Functions / Lambda@Edge', gcp: 'Cloud CDN + Service Extensions', azure: 'Front Door Rules Engine' },
    when: 'Logic that must run in < 5 ms near the user and needs no database round-trip.',
    tradeoffs: 'Strict CPU/memory limits; no heavy dependencies; state must live elsewhere.',
    baseCap: BIG, fields: ['hitRate', 'latencyMs'], fieldLabels: { hitRate: 'Answered at edge' },
    defaults: { hitRate: 0.5, latencyMs: 3 },
  },
  waf: {
    kind: 'waf', label: 'WAF', glyph: 'WAF', category: 'Edge', color: '#9A4E9E',
    desc: 'Web application firewall: filters bots, injection and abusive traffic.',
    providers: { aws: 'AWS WAF + Shield', gcp: 'Cloud Armor', azure: 'Azure WAF' },
    when: 'Anything public on the internet.',
    tradeoffs: 'Rules need tuning; false positives block real users.',
    baseCap: BIG, fields: ['region', 'latencyMs'], defaults: { latencyMs: 1 },
  },
  ratelimiter: {
    kind: 'ratelimiter', label: 'Rate Limiter', glyph: 'RL', category: 'Edge', color: '#A8507A',
    desc: 'Caps requests/sec to protect everything behind it. Excess gets HTTP 429.',
    providers: { aws: 'API Gateway throttling / WAF rate rules', gcp: 'Cloud Armor rate limiting', azure: 'APIM rate-limit policy' },
    when: 'Protect a fragile backend from spikes, abusive clients, or a virtual waiting room.',
    tradeoffs: 'Rejected requests are failures for those users — size the backend first, limit second.',
    baseCap: BIG, fields: ['region', 'rateLimit', 'latencyMs'], fieldLabels: { rateLimit: 'Limit (req/s)' },
    defaults: { rateLimit: 10000, latencyMs: 1 },
  },
  // ---------------------------------------------------------------- compute
  lb: {
    kind: 'lb', label: 'Load Balancer', glyph: 'LB', category: 'Compute', color: '#23867F',
    desc: 'Spreads traffic across healthy targets; health checks stop traffic to dead ones.',
    providers: { aws: 'Application Load Balancer', gcp: 'Cloud Load Balancing', azure: 'Application Gateway' },
    when: 'In front of any group of 2+ servers.',
    tradeoffs: 'Small fixed cost plus per-GB processing. Itself redundant across zones.',
    baseCap: BIG, fields: ['region', 'latencyMs'], defaults: { latencyMs: 1 },
  },
  gateway: {
    kind: 'gateway', label: 'API Gateway', glyph: 'API', category: 'Compute', color: '#2A7AA8',
    desc: 'Managed entry point: routing, auth hooks, quotas, request validation. Billed per request.',
    providers: { aws: 'API Gateway (HTTP API)', gcp: 'API Gateway / Apigee', azure: 'API Management' },
    when: 'Public APIs with many routes, API keys, quotas, or serverless backends.',
    tradeoffs: 'Per-request pricing gets expensive at very high RPS — an LB is far cheaper there.',
    baseCap: BIG, fields: ['region', 'latencyMs'], defaults: { latencyMs: 6 },
  },
  websocket: {
    kind: 'websocket', label: 'WebSocket Servers', glyph: 'WS', category: 'Compute', color: '#2F86B8', scalable: true, autoscalable: true, pricingLevers: true, armCapable: true, priceMult: 1,
    desc: 'Connection servers holding long-lived sockets so you can push messages. ~5,000 messages/s per S instance.',
    providers: { aws: 'EC2/ECS (Socket.IO, ws) · or API Gateway WebSocket', gcp: 'Cloud Run / GKE WebSockets', azure: 'Azure Web PubSub / SignalR' },
    when: 'Real-time push: chat, ride dispatch, multiplayer, live dashboards, LLM token streaming.',
    tradeoffs: 'Stateful connections complicate deploys and scaling-in; reconnect storms after outages. Managed per-message gateways get pricey at high volume.',
    baseCap: 5000, fields: COMPUTE_FIELDS,
    defaults: { instances: 2, size: 'M', autoscale: true, minInstances: 2, maxInstances: 40, latencyMs: 3 },
  },
  app: {
    kind: 'app', label: 'App Servers', glyph: 'APP', category: 'Compute', color: '#2457C5', scalable: true, autoscalable: true, pricingLevers: true, armCapable: true,
    desc: 'Stateless VMs in an autoscaling group. ~400 req/s per S instance.',
    providers: { aws: 'EC2 Auto Scaling', gcp: 'Compute Engine MIG', azure: 'VM Scale Sets' },
    when: 'Steady, high-throughput services where you want full control and the lowest per-request cost.',
    tradeoffs: 'You patch and operate the OS. Cheapest at scale, especially with reserved + ARM.',
    baseCap: 400, priceMult: 1, fields: COMPUTE_FIELDS,
    defaults: { instances: 2, size: 'M', minInstances: 2, maxInstances: 20, latencyMs: 25 },
  },
  container: {
    kind: 'container', label: 'Containers', glyph: 'CTR', category: 'Compute', color: '#3165B8', scalable: true, autoscalable: true, pricingLevers: true, armCapable: true,
    desc: 'Serverless containers: no servers to manage, billed per vCPU-second. ~400 req/s per S task.',
    providers: { aws: 'ECS on Fargate', gcp: 'Cloud Run', azure: 'Container Apps' },
    when: 'Most new services: easy deploys, scale-to-few, no cluster to run.',
    tradeoffs: '~25 % pricier per vCPU than raw VMs; cold starts when scaling from very low.',
    baseCap: 400, priceMult: 1.25, fields: COMPUTE_FIELDS,
    defaults: { instances: 2, size: 'M', minInstances: 1, maxInstances: 40, latencyMs: 25, autoscale: true },
  },
  k8s: {
    kind: 'k8s', label: 'Kubernetes', glyph: 'K8S', category: 'Compute', color: '#3D58B0', scalable: true, autoscalable: true, pricingLevers: true, armCapable: true,
    desc: 'Managed Kubernetes cluster; instances = worker nodes. Control plane billed separately.',
    providers: { aws: 'EKS', gcp: 'GKE', azure: 'AKS' },
    when: 'Many services, a platform team, need for portability or bin-packing many workloads.',
    tradeoffs: 'Significant operational complexity; ~$73/mo control plane; great bin-packing at scale.',
    baseCap: 420, priceMult: 1, fields: COMPUTE_FIELDS, fieldLabels: { instances: 'Worker nodes' },
    defaults: { instances: 3, size: 'L', minInstances: 3, maxInstances: 30, latencyMs: 22 },
  },
  serverless: {
    kind: 'serverless', label: 'Functions', glyph: 'λ', category: 'Compute', color: '#B7791F',
    desc: 'Serverless functions: pay per request, scale to a concurrency limit, occasional cold starts.',
    providers: { aws: 'Lambda', gcp: 'Cloud Run functions', azure: 'Azure Functions' },
    when: 'Spiky or low-volume work, glue code, event handlers, cron jobs.',
    tradeoffs: 'Cheapest when idle, most expensive at sustained high RPS. Cold starts hurt p99.',
    baseCap: 20000, fields: ['region', 'rateLimit', 'latencyMs'], fieldLabels: { rateLimit: 'Concurrency limit' },
    defaults: { rateLimit: 1000, latencyMs: 50 },
  },
  // ---------------------------------------------------------------- data
  cache: {
    kind: 'cache', label: 'Cache', glyph: 'RDS', category: 'Data', color: '#C0602B', scalable: true, pricingLevers: true, armCapable: true, priceMult: 1.6,
    desc: 'In-memory cache (Redis). Hits return in ~1 ms; misses and writes pass to what is behind it. With nothing behind it, it is the store (sessions, leaderboards, geo index).',
    providers: { aws: 'ElastiCache for Redis / Valkey', gcp: 'Memorystore', azure: 'Azure Cache for Redis' },
    when: 'Read-heavy data, hot keys, sessions, counters, sorted sets, rate-limit buckets.',
    tradeoffs: 'Stale data and invalidation bugs; memory is expensive per GB; a cold cache causes a thundering herd.',
    baseCap: 25000, fields: ['region', 'size', 'instances', 'hitRate', 'pricing', 'arch', 'latencyMs'], fieldLabels: { instances: 'Nodes' },
    defaults: { instances: 2, size: 'M', hitRate: 0.8, latencyMs: 1 },
  },
  sql: {
    kind: 'sql', label: 'SQL Database', glyph: 'SQL', category: 'Data', color: '#2E6DA4', terminal: true, scalable: true, pricingLevers: true, armCapable: true, priceMult: 2,
    desc: 'Relational DB. Writes go to each shard\'s primary; reads spread over primary + replicas.',
    providers: { aws: 'RDS / Aurora PostgreSQL', gcp: 'Cloud SQL / AlloyDB', azure: 'Azure Database for PostgreSQL' },
    when: 'Money, inventory, bookings, anything needing transactions, joins and strong consistency.',
    tradeoffs: 'Writes scale only by sharding (hard). Replicas lag. Multi-AZ doubles the primary cost but survives a zone failure.',
    baseCap: 2000, baseWriteCap: 800,
    fields: ['region', 'size', 'replicas', 'shards', 'multiAz', 'storageGB', 'pricing', 'arch', 'latencyMs'],
    fieldLabels: { latencyMs: 'Read latency (ms)' },
    defaults: { size: 'L', replicas: 0, shards: 1, storageGB: 100, latencyMs: 4, instances: 1 },
  },
  nosql: {
    kind: 'nosql', label: 'NoSQL DB', glyph: 'KV', category: 'Data', color: '#4A5FB3', terminal: true,
    desc: 'Managed key-value / document store, on-demand billing. Partitions scale throughput.',
    providers: { aws: 'DynamoDB', gcp: 'Firestore / Bigtable', azure: 'Cosmos DB' },
    when: 'Huge scale with simple access patterns by key: feeds, carts, chat messages, sessions.',
    tradeoffs: 'No joins; design tables around queries. On-demand is easy but pricey at steady high write rates.',
    baseCap: 40000, baseWriteCap: 12000,
    fields: ['region', 'shards', 'consistency', 'storageGB', 'latencyMs'], fieldLabels: { shards: 'Partitions' },
    defaults: { shards: 4, storageGB: 200, latencyMs: 6, consistency: 'eventual' },
  },
  globaldb: {
    kind: 'globaldb', label: 'Global Database', glyph: 'GDB', category: 'Data', color: '#5B4FB0', terminal: true, global: true,
    desc: 'Database replicated across regions: local reads everywhere; writes are replicated or agreed by consensus.',
    providers: { aws: 'Aurora Global / DynamoDB Global Tables', gcp: 'Spanner', azure: 'Cosmos DB multi-region' },
    when: 'Global users who need fast local reads and survival of a full region outage.',
    tradeoffs: 'Strong consistency adds ~60 ms to every write (cross-region consensus). Several times the cost of one region.',
    baseCap: 50000, baseWriteCap: 15000,
    fields: ['replicas', 'shards', 'consistency', 'storageGB', 'latencyMs'],
    fieldLabels: { replicas: 'Regions', shards: 'Capacity units' },
    defaults: { replicas: 3, shards: 4, storageGB: 500, latencyMs: 5, consistency: 'strong' },
  },
  storage: {
    kind: 'storage', label: 'Object Storage', glyph: 'S3', category: 'Data', color: '#2F8F5B', terminal: true,
    desc: 'Blob storage for images, video, files, backups, data lakes. Cheap per GB, slower per request.',
    providers: { aws: 'S3', gcp: 'Cloud Storage', azure: 'Blob Storage' },
    when: 'Any file or large blob. Let clients upload directly with pre-signed URLs.',
    tradeoffs: 'Tens of ms per request; per-request fees; serve hot objects through a CDN.',
    baseCap: 55000, baseWriteCap: 35000,
    fields: ['region', 'storageGB', 'latencyMs'], defaults: { storageGB: 2000, latencyMs: 30 },
  },
  search: {
    kind: 'search', label: 'Search Cluster', glyph: 'SRC', category: 'Data', color: '#1F8A80', terminal: true, scalable: true, autoscalable: true, pricingLevers: true, armCapable: true, priceMult: 2.5,
    desc: 'Full-text / vector search cluster. ~300 queries/s per S node.',
    providers: { aws: 'OpenSearch Service', gcp: 'Vertex AI Search / Elastic Cloud', azure: 'Azure AI Search' },
    when: 'Text search, typeahead, faceted filters, semantic (vector) retrieval.',
    tradeoffs: 'Eventually consistent with the source of truth; heavy on memory; index via a stream, not dual writes.',
    baseCap: 300,
    fields: ['region', 'size', 'instances', 'autoscale', 'minInstances', 'maxInstances', 'pricing', 'arch', 'latencyMs'],
    fieldLabels: { instances: 'Nodes' },
    defaults: { instances: 3, size: 'M', minInstances: 3, maxInstances: 12, latencyMs: 30 },
  },
  // ---------------------------------------------------------------- messaging
  queue: {
    kind: 'queue', label: 'Message Queue', glyph: 'MQ', category: 'Messaging', color: '#C77A0A', async: true,
    desc: 'Buffers work. The producer gets an instant ack; consumers drain at their own pace.',
    providers: { aws: 'SQS', gcp: 'Cloud Tasks / Pub/Sub pull', azure: 'Service Bus Queues' },
    when: 'Absorb spikes, decouple slow work (emails, payments, video encoding), retry safely.',
    tradeoffs: 'Work becomes eventually done; you need idempotent consumers and dead-letter queues.',
    baseCap: BIG, fields: ['region', 'latencyMs'], defaults: { latencyMs: 5 },
  },
  pubsub: {
    kind: 'pubsub', label: 'Pub/Sub Topic', glyph: 'P/S', category: 'Messaging', color: '#B86E14', async: true,
    desc: 'Fan-out: every message is delivered to every subscriber (connect each with "Every request").',
    providers: { aws: 'SNS / EventBridge', gcp: 'Pub/Sub', azure: 'Event Grid / Service Bus Topics' },
    when: 'One event, many independent reactions (email + push + analytics + search indexing).',
    tradeoffs: 'At-least-once delivery: subscribers must be idempotent. Ordering is not guaranteed.',
    baseCap: BIG, fields: ['region', 'latencyMs'], defaults: { latencyMs: 8 },
  },
  stream: {
    kind: 'stream', label: 'Event Stream', glyph: 'KFK', category: 'Messaging', color: '#C1681A', async: true,
    desc: 'Partitioned, replayable log. Each shard accepts ~1000 writes/s.',
    providers: { aws: 'Kinesis / MSK (Kafka)', gcp: 'Pub/Sub / Managed Kafka', azure: 'Event Hubs' },
    when: 'High-volume event firehoses: clicks, location pings, logs, change-data-capture.',
    tradeoffs: 'Shard planning; consumers manage offsets; retention costs storage.',
    baseCap: 1000, fields: ['region', 'shards', 'latencyMs'], fieldLabels: { shards: 'Shards' },
    defaults: { shards: 4, latencyMs: 10 },
  },
  worker: {
    kind: 'worker', label: 'Workers', glyph: 'WRK', category: 'Messaging', color: '#9C8410', scalable: true, autoscalable: true, pricingLevers: true, armCapable: true, priceMult: 1,
    desc: 'Background consumers that process jobs from a queue. ~150 jobs/s per S instance.',
    providers: { aws: 'EC2 / ECS workers', gcp: 'GCE / Cloud Run jobs', azure: 'VMSS / Container Apps jobs' },
    when: 'Anything that does not need to finish before replying to the user.',
    tradeoffs: 'Interruption-tolerant → perfect for spot capacity (−70 %).',
    baseCap: 150, fields: COMPUTE_FIELDS,
    defaults: { instances: 2, size: 'M', minInstances: 1, maxInstances: 30, latencyMs: 80 },
  },
  notify: {
    kind: 'notify', label: 'Notifications', glyph: 'NTF', category: 'Messaging', color: '#A88210', terminal: true,
    desc: 'Delivers email, SMS or mobile push. Billed per message; providers enforce send-rate limits.',
    providers: { aws: 'SES / SNS Mobile Push / Pinpoint', gcp: 'Firebase Cloud Messaging', azure: 'Notification Hubs / Communication Services' },
    when: 'The last hop of any notification system.',
    tradeoffs: 'Send-rate quotas: put a queue in front. SMS is ~100× the price of push.',
    baseCap: BIG, fields: ['region', 'rateLimit', 'unitCost', 'latencyMs'], fieldLabels: { rateLimit: 'Send rate limit (/s)' },
    defaults: { rateLimit: 20000, unitCost: 0.5, latencyMs: 60 },
  },
  // ---------------------------------------------------------------- analytics & ai
  streamproc: {
    kind: 'streamproc', label: 'Stream Processor', glyph: 'FLK', category: 'Analytics & AI', color: '#B23A78', scalable: true, autoscalable: true, pricingLevers: true, priceMult: 1.8,
    desc: 'Continuous processing of event streams: aggregation, enrichment, windowed counts. ~2000 events/s per S unit. Writes downstream in batches of 100.',
    providers: { aws: 'Managed Service for Apache Flink', gcp: 'Dataflow', azure: 'Stream Analytics' },
    when: 'Real-time metrics, fraud signals, trending topics, ETL from a stream into a warehouse.',
    tradeoffs: 'Stateful jobs need checkpoints; exactly-once is hard and costs latency.',
    baseCap: 2000, fields: COMPUTE_FIELDS, fieldLabels: { instances: 'Processing units' },
    defaults: { instances: 2, size: 'M', minInstances: 1, maxInstances: 40, latencyMs: 40 },
  },
  warehouse: {
    kind: 'warehouse', label: 'Data Warehouse', glyph: 'DWH', category: 'Analytics & AI', color: '#3D8B5F', terminal: true, scalable: true, pricingLevers: true, priceMult: 5,
    desc: 'Columnar analytics store. Fast bulk ingest; queries take hundreds of ms. ~40 queries/s per S node.',
    providers: { aws: 'Redshift', gcp: 'BigQuery', azure: 'Synapse / Fabric Warehouse' },
    when: 'Dashboards, reporting, ad-hoc analytics over billions of rows.',
    tradeoffs: 'Never put it on a user-facing request path; batch writes, not row-by-row.',
    baseCap: 40, baseWriteCap: 50000,
    fields: ['region', 'size', 'instances', 'storageGB', 'pricing', 'latencyMs'], fieldLabels: { instances: 'Nodes' },
    defaults: { instances: 2, size: 'L', storageGB: 5000, latencyMs: 600 },
  },
  inference: {
    kind: 'inference', label: 'ML Inference', glyph: 'GPU', category: 'Analytics & AI', color: '#A8418F', terminal: true, scalable: true, autoscalable: true, pricingLevers: true, priceMult: 24,
    desc: 'Self-hosted model on GPU instances. ~8 req/s per S GPU; slow and expensive per instance.',
    providers: { aws: 'SageMaker endpoints / EC2 GPU', gcp: 'Vertex AI endpoints / GKE GPUs', azure: 'Azure ML online endpoints' },
    when: 'Custom or open-weight models, or when per-call API pricing exceeds GPU hours.',
    tradeoffs: 'GPUs idle at night still cost money; batching and caching matter enormously.',
    baseCap: 8, fields: ['region', 'size', 'instances', 'autoscale', 'minInstances', 'maxInstances', 'pricing', 'latencyMs'],
    fieldLabels: { instances: 'GPU instances' },
    defaults: { instances: 2, size: 'M', minInstances: 1, maxInstances: 20, latencyMs: 450 },
  },
  // ---------------------------------------------------------------- external
  external: {
    kind: 'external', label: 'External API', glyph: 'EXT', category: 'External', color: '#5B6770', terminal: true,
    desc: 'A third-party service: payment provider, LLM API, maps, SMS. You pay per call and live with its rate limit and latency.',
    providers: { aws: 'Third party (Stripe, OpenAI, Twilio…)', gcp: 'Third party (Stripe, OpenAI, Twilio…)', azure: 'Third party (Stripe, OpenAI, Twilio…)' },
    when: 'Anything you should not build yourself.',
    tradeoffs: 'Their outage is your outage: use timeouts, retries with idempotency keys, a circuit breaker, and a queue.',
    baseCap: BIG, fields: ['region', 'rateLimit', 'unitCost', 'latencyMs'], fieldLabels: { rateLimit: 'Provider rate limit (/s)' },
    defaults: { rateLimit: 1000, unitCost: 1, latencyMs: 300 },
  },
  auth: {
    kind: 'auth', label: 'Auth Service', glyph: 'ID', category: 'External', color: '#4E6A7D',
    desc: 'Managed identity: sign-in, tokens, MFA. Connect with "Every request" to validate each call.',
    providers: { aws: 'Cognito', gcp: 'Identity Platform', azure: 'Entra External ID' },
    when: 'User accounts in almost any consumer product.',
    tradeoffs: 'Validate JWTs locally where you can — calling the auth service on every request adds latency.',
    baseCap: BIG, fields: ['region', 'latencyMs'], defaults: { latencyMs: 12 },
  },
}

export const KIND_ORDER: NodeKind[] = [
  'client',
  'dns', 'cdn', 'edgefn', 'waf', 'ratelimiter',
  'lb', 'gateway', 'websocket', 'app', 'container', 'k8s', 'serverless',
  'cache', 'sql', 'nosql', 'globaldb', 'storage', 'search',
  'queue', 'pubsub', 'stream', 'worker', 'notify',
  'streamproc', 'warehouse', 'inference',
  'external', 'auth',
]

export const CATEGORIES: Category[] = ['Traffic', 'Edge', 'Compute', 'Data', 'Messaging', 'Analytics & AI', 'External']

export const BASE_CONFIG: NodeConfig = {
  region: 'us-east-1',
  instances: 1,
  size: 'S',
  autoscale: false,
  minInstances: 1,
  maxInstances: 10,
  users: 0,
  reqPerUserMin: 0,
  readRatio: 0.8,
  payloadKB: 20,
  pattern: 'steady',
  hitRate: 0,
  replicas: 0,
  shards: 1,
  storageGB: 0,
  rateLimit: 0,
  latencyMs: 5,
  pricing: 'ondemand',
  arch: 'x86',
  multiAz: false,
  consistency: 'eventual',
  unitCost: 0,
}

export function defaultConfig(kind: NodeKind, patch: Partial<NodeConfig> = {}): NodeConfig {
  const def = CATALOG[kind]
  const cfg = { ...BASE_CONFIG, ...def.defaults, ...patch }
  if (def.global) cfg.region = 'global'
  return cfg
}

export interface FieldMeta {
  label: string
  type: 'number' | 'slider' | 'select' | 'toggle' | 'region' | 'location'
  min?: number
  max?: number
  step?: number
  unit?: string
  options?: { value: string; label: string }[]
  help?: string
  percent?: boolean
}

export const FIELD_META: Record<FieldKey, FieldMeta> = {
  region: { label: 'Region', type: 'region' },
  instances: { label: 'Instances', type: 'number', min: 1, max: 1000, step: 1 },
  size: {
    label: 'Instance size', type: 'select',
    options: (Object.keys(SIZES) as SizeKey[]).map((k) => ({ value: k, label: SIZES[k].label })),
  },
  autoscale: { label: 'Autoscaling', type: 'toggle', help: 'Targets ~60 % utilisation. Scales out within ~2 min, in slowly.' },
  minInstances: { label: 'Min instances', type: 'number', min: 1, max: 1000, step: 1 },
  maxInstances: { label: 'Max instances', type: 'number', min: 1, max: 2000, step: 1 },
  users: { label: 'Active users', type: 'number', min: 0, max: 100_000_000, step: 1000 },
  reqPerUserMin: { label: 'Requests / user / min', type: 'slider', min: 0.1, max: 120, step: 0.1 },
  readRatio: { label: 'Read share', type: 'slider', min: 0, max: 1, step: 0.01, percent: true, help: 'Reads vs writes. Feeds, catalogs and media are 90 %+ reads.' },
  payloadKB: { label: 'Response size', type: 'number', min: 0.1, max: 100000, step: 1, unit: 'KB', help: 'Drives bandwidth and egress cost.' },
  pattern: {
    label: 'Traffic pattern', type: 'select',
    options: [
      { value: 'steady', label: 'Steady' },
      { value: 'daily', label: 'Daily wave (peak ~16:00)' },
      { value: 'spike', label: 'Flash spike (12:00–12:30, ×6)' },
      { value: 'growth', label: 'Growth (×0.5 → ×2.5 over the day)' },
    ],
  },
  hitRate: { label: 'Hit rate', type: 'slider', min: 0, max: 0.99, step: 0.01, percent: true },
  replicas: { label: 'Read replicas / shard', type: 'number', min: 0, max: 15, step: 1, help: 'Replicas add read capacity and a failover target.' },
  shards: { label: 'Shards', type: 'number', min: 1, max: 256, step: 1, help: 'Each shard adds write and read capacity.' },
  storageGB: { label: 'Stored data', type: 'number', min: 0, max: 100_000_000, step: 10, unit: 'GB' },
  rateLimit: { label: 'Limit', type: 'number', min: 1, max: 10_000_000, step: 100 },
  latencyMs: { label: 'Service time', type: 'number', min: 0.1, max: 30000, step: 0.5, unit: 'ms' },
  pricing: {
    label: 'Pricing', type: 'select',
    help: 'Reserved / savings plan: ~40 % off the committed baseline (min instances). Spot: ~70 % off but can be reclaimed — fine for stateless or batch, risky for databases.',
    options: [
      { value: 'ondemand', label: 'On-demand' },
      { value: 'reserved', label: 'Reserved baseline (−40 %)' },
      { value: 'spot', label: 'Spot (−70 %, interruptible)' },
    ],
  },
  arch: {
    label: 'CPU', type: 'select', help: 'ARM instances (Graviton / Axion / Cobalt) cost ~20 % less for the same throughput on most workloads.',
    options: [{ value: 'x86', label: 'x86' }, { value: 'arm', label: 'ARM (−20 %)' }],
  },
  multiAz: { label: 'Multi-AZ standby', type: 'toggle', help: 'A synchronous standby in a second zone: survives an AZ outage with no data loss. Doubles primary cost.' },
  consistency: {
    label: 'Consistency', type: 'select',
    help: 'Strong reads/writes cost more and are slower (consensus); eventual is cheaper and faster but may return stale data.',
    options: [{ value: 'eventual', label: 'Eventual' }, { value: 'strong', label: 'Strong' }],
  },
  unitCost: { label: 'Price per 1k calls', type: 'number', min: 0, max: 1000, step: 0.01, unit: '$' },
}

export function visibleFields(kind: NodeKind, cfg: NodeConfig): FieldKey[] {
  const def = CATALOG[kind]
  return def.fields.filter((f) => {
    if ((f === 'minInstances' || f === 'maxInstances') && !cfg.autoscale) return false
    if (f === 'autoscale' && !def.autoscalable) return false
    if (f === 'arch' && !def.armCapable) return false
    return true
  })
}

export const fieldLabel = (kind: NodeKind, f: FieldKey) => CATALOG[kind].fieldLabels?.[f] ?? FIELD_META[f].label

export const providerName = (kind: NodeKind, p: Provider) => CATALOG[kind].providers[p]

const CAT_SLUG: Record<Category, string> = {
  Traffic: 'traffic', Edge: 'edge', Compute: 'compute', Data: 'data', Messaging: 'messaging', 'Analytics & AI': 'ai', External: 'external',
}
/** CSS variables that colour a component everywhere: its marker colour and its family's pastel. */
export const catVars = (kind: NodeKind): Record<string, string> => ({
  '--accent': CATALOG[kind].color,
  '--cat': `var(--cat-${CAT_SLUG[CATALOG[kind].category]})`,
})
