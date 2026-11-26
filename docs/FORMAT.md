# The ArchSim design format

Every design is a small JSON document. **File, Export JSON** downloads it, **File, Import JSON** loads it, and **Copy share link** puts the same JSON, compressed, in the address. That makes designs easy to keep in a repo, review in a pull request, or generate with a script or an AI agent.

## Shape

```jsonc
{
  "v": 1,                          // format version, always 1 for now
  "title": "Read-heavy API",
  "challengeId": null,             // or a challenge id such as "shortener"
  "nodes": [
    { "id": "users", "p": [0, 0],   "d": { "kind": "client", "label": "Users · US",
      "config": { "region": "city-nyc", "users": 100000, "reqPerUserMin": 6, "readRatio": 0.9, "payloadKB": 20, "pattern": "daily" } } },
    { "id": "lb",    "p": [240, 0], "d": { "kind": "lb",     "label": "Load balancer", "config": { "region": "us-east-1" } } },
    { "id": "api",   "p": [480, 0], "d": { "kind": "app",    "label": "API",
      "config": { "region": "us-east-1", "instances": 4, "size": "M", "autoscale": true, "minInstances": 4, "maxInstances": 20 } } },
    { "id": "cache", "p": [720, -80], "d": { "kind": "cache", "label": "Redis", "config": { "region": "us-east-1", "hitRate": 0.85 } } },
    { "id": "db",    "p": [720, 80],  "d": { "kind": "sql",   "label": "Postgres", "config": { "region": "us-east-1", "replicas": 1, "multiAz": true } } }
  ],
  "edges": [
    { "id": "e1", "s": "users", "t": "lb" },
    { "id": "e2", "s": "lb",    "t": "api" },
    { "id": "e3", "s": "api",   "t": "cache", "d": { "mode": "all", "filter": "read" } },
    { "id": "e4", "s": "cache", "t": "db",    "d": { "mode": "all" } },
    { "id": "e5", "s": "api",   "t": "db",    "d": { "mode": "all", "filter": "write" } }
  ],
  "notes": [
    { "id": "n1", "p": [0, -200], "w": 220, "h": 150, "text": "Reads can be a few seconds stale.", "color": "yellow" }
  ]
}
```

`p` is the position on the board. Anything you leave out of `config` gets that component's default, so a node only needs the fields you care about.

## Nodes

`kind` is one of the 29 component kinds in [`src/sim/types.ts`](../src/sim/types.ts):

| Group | Kinds |
|---|---|
| Traffic | `client` |
| Edge | `dns`, `cdn`, `edgefn`, `waf`, `ratelimiter` |
| Compute | `lb`, `gateway`, `app`, `container`, `k8s`, `serverless`, `worker`, `websocket`, `auth` |
| Data | `sql`, `nosql`, `globaldb`, `cache`, `storage`, `search` |
| Messaging | `queue`, `stream`, `pubsub`, `notify` |
| Analytics and AI | `warehouse`, `streamproc`, `inference` |
| External | `external` |

Common `config` fields:

| Field | Meaning |
|---|---|
| `region` | A cloud region such as `us-east-1` or `eu-central-1`, a city such as `city-london` (for users), or `global` for edge services. The full list is in [`src/sim/regions.ts`](../src/sim/regions.ts). |
| `instances`, `size` (`S` `M` `L` `XL`) | Fleet size. |
| `autoscale`, `minInstances`, `maxInstances` | Autoscaling bounds. |
| `users`, `reqPerUserMin`, `readRatio`, `payloadKB`, `pattern` | Traffic, for `client` nodes. `pattern` is `steady`, `daily`, `spike` or `growth`. |
| `hitRate` | Share of reads a cache or CDN answers, 0 to 1. |
| `replicas`, `shards`, `multiAz`, `consistency` | Databases. `consistency` is `eventual` or `strong`. |
| `pricing` (`ondemand` `reserved` `spot`), `arch` (`x86` `arm`) | Cost levers. |
| `rateLimit`, `latencyMs`, `storageGB`, `unitCost` | Limits, service time, storage, and price per 1,000 calls for external APIs. |

## Edges

`s` and `t` are node ids. `d` is optional:

| Field | Values | Meaning |
|---|---|---|
| `mode` | `split` (default), `all` | `split` shares traffic with sibling edges by weight and skips dead targets. `all` sends every request, like a call made each time. |
| `filter` | `any` (default), `read`, `write` | Carry only reads or only writes. |
| `weight` | number, default 1 | Share for `split` edges. |
| `retries` | 0 to 3 | Retries on failure. |
| `breaker` | true or false | Circuit breaker. |

Edges cannot form a cycle and cannot point into a `client`.

## Share links

A share link is `https://archsim-pi.vercel.app/#g=` followed by the JSON compressed with [lz-string](https://github.com/pieroxy/lz-string)'s `compressToEncodedURIComponent`. To make one from a script:

```js
import { compressToEncodedURIComponent } from 'lz-string'
const url = 'https://archsim-pi.vercel.app/#g=' + compressToEncodedURIComponent(JSON.stringify(design))
```

Unknown kinds, edges to missing nodes and unknown challenge ids are dropped on import rather than failing.

## Challenges

A challenge is a problem, its targets, its design checks and a reference solution in steps, all in one JSON document. The in-app editor (*Problems → Create a challenge*) writes it for you from boards you capture, and *Download JSON* saves it. Every problem in [`src/sim/problems.ts`](../src/sim/problems.ts) is written this way.

```jsonc
{
  "v": 1,
  "id": "team-wiki",
  "title": "Team Wiki",
  "difficulty": "Medium",                  // Easy, Medium or Hard
  "topic": "Caching",
  "tags": ["read-heavy"],
  "brief": "50k employees read pages all day; edits are rare.",
  "hints": ["Most reads are the same 1,000 pages."],
  "author": "Priya",                       // shown to candidates
  "targets": { "p99": 200, "availability": 0.999, "budget": 7000 },  // backlogSec is optional
  "checks": [
    { "type": "noDirect", "from": ["client"], "to": ["app"], "label": "Servers sit behind a load balancer" },
    { "type": "path", "from": ["client"], "to": ["cache"] },
    { "type": "resilient", "kinds": ["sql"] }
  ],
  "steps": [
    { "title": "One server and a database", "why": "Start simple." },
    { "title": "Add a cache", "why": "Reads are 99% of traffic." }
  ],
  "nodes": [
    { "key": "u", "kind": "client", "col": 0, "row": 1, "config": { "users": 50000, "reqPerUserMin": 2, "readRatio": 0.95 } },
    { "key": "lb", "kind": "lb", "col": 1, "row": 1, "from": 0 },
    { "key": "app", "kind": "app", "col": 2, "row": 1, "from": 0, "at": { "1": { "instances": 4 } } },
    { "key": "c", "kind": "cache", "col": 3, "row": 0, "from": 1 },
    { "key": "db", "kind": "sql", "col": 3, "row": 2, "from": 0, "at": { "1": { "multiAz": true } } }
  ],
  "edges": [
    { "a": "u", "b": "lb", "from": 0 },
    { "a": "lb", "b": "app", "from": 0 },
    { "a": "app", "b": "db", "from": 0 },
    { "a": "app", "b": "c", "from": 1, "filter": "read" }
  ]
}
```

**Steps.** Step `-1` is the board the candidate starts from, usually just the users. A node or edge appears from step `from` (default `0`, or `-1` for `client`) and disappears at step `until`. `at` patches a node's `config` from a given step on. `col` and `row` are grid positions, 235 by 150 pixels.

**Checks.**

| `type` | Fields | Passes when |
|---|---|---|
| `has` | `kinds`, `min?` | At least `min` (default 1) of these kinds are on the board. |
| `lacks` | `kinds` | None of these kinds are on the board. |
| `path` | `from`, `to`, `via?` | Traffic can flow from one of `from` to one of `to`, optionally through `via`. |
| `decoupled` | `from`, `to` | `from` reaches `to` only through a queue or stream. |
| `noDirect` | `from`, `to` | No edge goes straight from `from` to `to`. |
| `resilient` | `kinds` | Every node of these kinds survives losing a zone (Multi-AZ, replicas, or two or more instances). |
| `autoscale` | `kinds?` | The stateless tier autoscales. |
| `regions` | `min` | Parts run in at least `min` regions. |
| `config` | `kinds`, `field`, `op`, `value` | Every node of these kinds has a setting that compares as given (`>=`, `<=`, `==`). |

Every check takes an optional `label` and `why`; without them ArchSim writes its own.

## Challenge links and result links

A challenge link is `https://archsim-pi.vercel.app/#c=` followed by the challenge JSON compressed with lz-string, the same way as a design. Opening it adds the challenge to the candidate's problem list and starts it.

When the candidate presses *Send to interviewer*, ArchSim runs the 24-hour test and makes a result link, `#r=`, holding their design, the report against the targets and checks, their practice notes and how long they took. For a custom challenge the result also carries the challenge itself, so the interviewer can open it on any machine. Nothing is uploaded anywhere: the whole thing lives in the link.
