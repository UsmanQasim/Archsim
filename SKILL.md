---
name: archsim-system-design
description: Use when designing, reviewing, modifying, explaining, or generating an ArchSim architecture, including component choices, capacity sizing, routing, failure testing, cost trade-offs, and importable ArchSim designs.
---

# ArchSim system design skill

Use this skill for any request involving this repository or a system that should be modeled in ArchSim.

The goal is not merely to make a diagram. Produce a **coherent, measurable architecture** that can be imported into ArchSim, explain the decisions, and identify the assumptions and remaining risks.

## 1. Read the repository state first

For repository-aware work, inspect these files before answering or editing:

- `src/sim/catalog.ts` - supported components, cloud mappings, defaults, capacities, and cost levers
- `src/sim/types.ts` - exact node, edge, configuration, chaos, and simulation result types
- `src/sim/engine.ts` - traffic propagation, latency, availability, autoscaling, cost, and failure behavior
- `src/sim/analysis.ts` - breaking-point, 24-hour, and latency-trace calculations
- `src/sim/regions.ts` - valid cloud regions and user locations
- `src/sim/scenarios.ts` - starter templates and graph format
- `src/sim/challenges.ts` - interview problems, targets, checks, hints, and reference solutions
- `src/store.ts` - import/export/share serialization

Never assume a component, field, region, edge mode, or feature exists unless it is present in these files or confirmed by the catalog.

## 2. Establish requirements before designing

Translate a vague prompt into explicit assumptions. If information is missing, state sensible defaults rather than blocking progress.

Define or infer:

| Area | Questions to resolve |
|---|---|
| Users | Location, active users, requests per user per minute, peak pattern |
| Workload | Read/write ratio, payload size, spike behavior, batch jobs, real-time traffic |
| Data | Read/write volume, consistency needs, retention, storage growth, access patterns |
| Availability | Regional or zonal requirements, RPO/RTO, target availability |
| Latency | End-user p50/p95/p99 targets and allowed regional distance |
| Scale | Daily, monthly, or projected throughput and growth |
| Cost | Hard budget or optimization objective |
| Operations | Expected team expertise, managed versus self-managed preference |

If the prompt supplies no capacity data, use a clearly labeled baseline:

- `steady` traffic unless a spike, growth, or daily pattern is specified
- `1,000` or `100,000` users only when examples require it, with a visible assumption
- AWS provider mapping unless another provider is requested
- `us-east-1` for deployment unless geographic evidence suggests another region
- `M` compute size and autoscaling enabled only for realistic production-style designs

## 3. Use the ArchSim model

### Supported node kinds

Use only these `kind` values:

```text
client, dns, cdn, edgefn, waf, ratelimiter,
lb, gateway, websocket, app, container, k8s, serverless,
cache, sql, nosql, globaldb, storage, search,
queue, pubsub, stream, worker, notify,
streamproc, warehouse, inference, external, auth
```

Read `CATALOG[kind]` for the authoritative label, provider mappings, trade-offs, fields, capacity, and defaults.

### Node configuration

Node configuration uses `NodeConfig`. The base fields are:

```ts
interface NodeConfig {
  region: string
  instances: number
  size: 'S' | 'M' | 'L' | 'XL'
  autoscale: boolean
  minInstances: number
  maxInstances: number
  users: number
  reqPerUserMin: number
  readRatio: number
  payloadKB: number
  pattern: 'steady' | 'daily' | 'spike' | 'growth'
  hitRate: number
  replicas: number
  shards: number
  storageGB: number
  rateLimit: number
  latencyMs: number
  pricing: 'ondemand' | 'reserved' | 'spot'
  arch: 'x86' | 'arm'
  multiAz: boolean
  consistency: 'eventual' | 'strong'
  unitCost: number
}
```

Call `defaultConfig(kind, patch)` when implementing a design in TypeScript. Partial configuration is valid in generated JSON because deserialization merges it with component defaults.

Do not add irrelevant fields to a node. ArchSim ignores UI-only assumptions and validates against the known catalog at import time.

### Regions

Use one of these deployment regions:

```text
us-east-1, us-west-2, ca-central-1, sa-east-1,
eu-west-1, eu-central-1, me-central-1, ap-south-1,
ap-southeast-1, ap-northeast-1, ap-southeast-2, af-south-1
```

Use these user-only location IDs for `client.region`:

```text
city-nyc, city-sf, city-london, city-karachi, city-lahore,
city-lagos, city-jakarta, city-seoul, city-mexico
```

Global components such as DNS, CDN, edge functions, and global databases should use `region: "global"` when generating or editing a graph.

### Edges

Every connection has this shape:

```ts
interface SimEdgeData {
  mode: 'split' | 'all'
  filter: 'any' | 'read' | 'write'
  weight: number
  retries?: number
  breaker?: boolean
}
```

- `split`: weighted traffic distribution with automatic failover
- `all`: every request follows this edge; use for sequential fan-out or dependencies
- `read`: send only reads
- `write`: send only writes
- `weight`: relative share for split routing
- `retries`: 0-3 client retries
- `breaker`: stop calling an unhealthy target

Recommended edge conventions:

1. Use `client -> dns -> lb` for distributed public applications.
2. Use `lb -> app/container/k8s` for service entry.
3. Use read-filtered edges from compute to caches and write-filtered edges to stores.
4. Use `queue` or `pubsub` for work that should not block the response.
5. Use `all` for Pub/Sub subscribers and explicit sequential dependencies.
6. Use retries and circuit breakers for external APIs, but keep retries small and use an idempotency key in the design rationale.
7. Do not send warehouses or analytical batch pipelines on the user-facing hot path.

## 4. Choose architecture patterns deliberately

Use these patterns as starting points, then adapt them to requirements:

| Requirement | Preferred pattern |
|---|---|
| Public stateless API | CDN/WAF/rate limiter -> LB -> app/container tier -> cache -> SQL/NoSQL |
| Read-heavy feed or catalog | CDN -> regional apps -> Redis/cache -> regional or managed NoSQL |
| Global users | GeoDNS/CDN -> regional load balancers/apps -> cache -> global database |
| Spiky writes or flash sale | API gateway/rate limiter -> app -> queue -> workers -> SQL/NoSQL |
| Real-time chat or presence | WebSocket servers -> Pub/Sub or queue -> workers -> low-latency store |
| Media upload and delivery | Direct object storage upload -> queue/workers for processing -> CDN/object storage delivery |
| Search/autocomplete | Source data -> stream -> search cluster, with cache and read-only search requests |
| Notifications | API -> queue -> workers -> notification provider, with retries and a dead-letter concept |
| LLM assistant | API -> auth/rate limiting -> app -> cache for prompts/responses -> external API or GPU inference |
| Analytics pipeline | Event stream -> stream processor -> warehouse/storage |

Avoid these anti-patterns unless the requirement explicitly asks for them:

- Sending every request directly to a database
- Making a warehouse or stream processor part of the synchronous request path
- Scattered dual writes instead of one source of truth plus events
- Multiple monolithic services with no clear ownership
- Cache-as-source-of-truth
- Strong consistency everywhere for a read-heavy or highly available design
- Retries around a dead external API without a circuit breaker
- Spot or reserved-only sizing for a stateful database
- No capacity for a flash-sale or broadcast traffic spike

## 5. Apply a five-pass design process

### Pass 1 - flow

Create at least one `client` node and a directed path from it to the serving components. Name nodes by role and region, for example `Users - EU`, `API - Frankfurt`, or `Orders SQL`.

### Pass 2 - isolation

Separate synchronous serving, background work, and analytics.

Ask:

- What must finish before the user gets a response?
- What can move to a queue or worker?
- What should never block the API?

### Pass 3 - resilience

Address:

- Redundant compute
- Zone or regional failure
- Cache cold starts
- Retry amplification
- Circuit breakers
- Queue backlogs
- Idempotency
- Failing third-party dependencies

Use actual ArchSim controls: `failedNodes`, `failedRegions`, `failedAZs`, `cutEdges`, `edgeDelay`, `trafficMult`, and cache flushing.

### Pass 4 - capacity

Size enough to meet the baseline peak, not the average. Start with autoscaling for scalable compute, set reasonable minimum and maximum instance counts, and add replicas/shards where the catalog indicates read/write scaling.

Pay special attention to:

- Queue consumers and backlog
- Database write limits
- Cache hit rate
- External API rate limits
- Stream shard count
- GPU inference throughput
- CDN/static traffic

### Pass 5 - validation

Explain or, when using the repository, run:

- `npm run build`
- A steady-state peak test
- A full-day test
- A breaking-point test
- A 12-month growth test if growth data exists
- AZ/region and third-party failures

Do not present approximate costs or capacity numbers as guaranteed production measurements. ArchSim is a teaching model.

## 6. Generate an importable ArchSim design

ArchSim JSON uses a versioned envelope:

```json
{
  "v": 1,
  "title": "Short system name",
  "challengeId": null,
  "nodes": [
    {
      "id": "users",
      "p": [0, 150],
      "d": {
        "kind": "client",
        "label": "Users - US",
        "config": {
          "region": "city-nyc",
          "users": 100000,
          "reqPerUserMin": 6,
          "readRatio": 0.9,
          "payloadKB": 20,
          "pattern": "daily"
        }
      }
    }
  ],
  "edges": [
    {
      "id": "users-lb",
      "s": "users",
      "t": "lb",
      "d": {
        "mode": "split",
        "filter": "any",
        "weight": 1,
        "retries": 1,
        "breaker": true
      }
    }
  ],
  "notes": []
}
```

Rules for generated JSON:

- `v` must be `1`
- Every node needs a unique string `id`
- `p` is `[x, y]`
- Node data needs `kind`, `label`, and `config`
- Edge `s` and `t` must match existing node IDs
- Unknown node kinds must be rejected
- Include only a challenge ID already present in `CHALLENGES`
- `notes` is optional
- Prefer `defaultConfig(kind, patch)` for repository edits

A generated file should normally be named `<system-name>.archsim.json`.

AI tools must not construct a graph only in prose when an importable artifact is requested. Provide the JSON and, where repository access exists, implement or add the graph through the app's store and scenario APIs.

## 7. Present architecture decisions

End a design response with this structure:

### Assumptions

List what was inferred and what must be confirmed.

### Architecture

Explain the request flow and data flow, using component names and regions.

### Why these choices

For each major choice, state the alternatives and why this one fits:

- Requirement matched
- Benefit
- Trade-off
- Failure or scale behavior

### Capacity and cost expectations

Give the relevant:

- Peak offered traffic
- Expected p99 target
- Availability target
- Estimated bottleneck
- Monthly cost direction
- Cost-saving or scale-out options

### Risks and mitigations

List concrete risks, owner, and mitigation.

### Validation plan

Recommend the tests to run in ArchSim.

## 8. Model limitations

Do not claim ArchSim measurements are real provider benchmarks. Key assumptions include:

- RTT is approximately 1 ms per 100 km plus fixed distance overhead
- User-to-edge network adds approximately 5 ms
- Service latency uses queueing approximation
- M/D/1-style queue utilization penalizes near-saturated components
- Tail latency combines across a request path
- Costs use 2026-style list-price teaching estimates
- Cloud managed services and provider SLAs are approximations
- Autoscaling, outages, and retry behavior are deterministic teaching models

Use the app's `How the simulation works` information and `ASSUMPTIONS` in `engine.ts` when explaining uncertainty.

## 9. When modifying this repository

Add or update:

- Catalog definitions in `src/sim/catalog.ts`
- Types in `src/sim/types.ts`
- Engine behavior in `src/sim/engine.ts`
- Region IDs in `src/sim/regions.ts`
- Serialization behavior in `src/store.ts`
- Tests or build validation when a change affects graph generation or simulation

Before completing a code change, run the smallest relevant validation:

```bash
npm run build
```

Preserve existing graph and JSON compatibility. Serialization changes must update deserialization and share-link behavior together.
