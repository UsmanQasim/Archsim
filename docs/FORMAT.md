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
