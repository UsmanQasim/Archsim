# ArchSim — Requirements & Build Prompt

> Improved version of the original idea: "a better, 3D, hands-on version of designed-to-scale.vercel.app where I build systems myself, node-editor style, and see cost / bottlenecks / failures."
> Target tool: **Claude Code** (paste the block below into a fresh session in this folder to extend or rebuild the app).

---

```xml
<context>
You are a senior frontend engineer who also designs distributed systems. You are building ArchSim:
a free, client-only, browser-based SANDBOX for practising system design. It is deployed as a static
site on Vercel (no backend, no auth, no database, no paid APIs). The reference product,
designed-to-scale.vercel.app, is a passive step-through course of animated diagrams. ArchSim must be
the opposite: the learner builds the architecture by hand, changes any parameter, and immediately sees
traffic, latency, errors, cost and failure behaviour — in both a 2D node editor and a live 3D view.
</context>

<stack>
- Vite + React 18/19 + TypeScript (strict). Static build output in /dist. vercel.json with SPA rewrite.
- @xyflow/react for the 2D node editor (Unreal-Blueprint-style: typed ports, drag-to-connect, minimap).
- three + @react-three/fiber + @react-three/drei for the 3D view.
- zustand for state. lz-string for share links. No CSS framework; plain CSS with design tokens.
- No other runtime dependencies without asking.
</stack>

<features>
1. COMPONENT PALETTE (drag onto canvas), grouped:
   Edge: Clients/Users, DNS (GeoDNS), CDN, WAF, Rate Limiter
   Compute: Load Balancer, API Gateway, App Server (autoscaling group), Serverless Function, Worker
   Data: SQL DB (primary + read replicas + shards), NoSQL DB, Cache (Redis), Object Storage, Search
   Async: Message Queue, Pub/Sub / Stream
2. EVERY NODE IS TWEAKABLE in an inspector: region, instance type/size, instance count, min/max
   autoscale, per-instance capacity (RPS), base latency, cache hit rate, replicas, shards, rate limit,
   consumer count, etc. Client nodes: region, concurrent users, requests/user/min, read:write ratio,
   payload size, traffic pattern (steady / daily wave / spike / growth).
3. REGIONS: ~12 real cloud regions with lat/lon. Inter-region latency is derived from great-circle
   distance (~1 ms per 100 km RTT + 2 ms). Cross-region traffic is charged egress per GB.
4. EDGES: each connection has a mode — "split" (load is divided among siblings by weight) or
   "every request" (fan-out / sequential call). Optional weight. Edges can be cut (network partition)
   or given injected latency.
5. SIMULATION ENGINE (pure, deterministic TS module, unit-testable, no React imports):
   - Propagates read/write RPS through the graph each tick (topological order, cycles ignored + warned).
   - Capacity = instances x per-instance RPS; utilisation u = load / capacity.
   - Latency per node = base x 1/(1-u) (M/M/1 approximation, capped); p99 estimate from mean and u.
   - Overload drops the excess (errors); failed nodes drop everything; split edges fail over to
     healthy siblings automatically.
   - Cache absorbs hit-rate of reads; CDN absorbs static share; queues decouple latency and
     accumulate backlog when consumers are slower than producers.
   - Autoscaling reacts to utilisation with a cooldown.
   - Simulated 24 h clock with play / pause / speed (1x–600x) driving traffic patterns.
6. COST MODEL: monthly $ per node (instances x hourly price x 730 + storage + per-request where
   relevant) + cross-region egress. Show total, per-node breakdown, and cost per 1M requests.
7. CHAOS / WHAT-IF: kill a node, take a whole region offline, cut an edge, inject latency, traffic
   spike x2/x5/x10, "thundering herd" (cache flush). Every chaos action is reversible from a list.
8. RECOMMENDATIONS (rule engine, each with severity + one-click fix where possible):
   single point of failure, node > 80 % utilised, DB read-heavy with no cache/replica, cross-region
   DB calls, no CDN in front of static-heavy traffic, no LB in front of >1 server, writes with no
   queue during spikes, over-provisioned nodes (< 15 % utilised) wasting money, missing rate limiter.
9. CHALLENGES with targets (RPS, p99 latency, availability, monthly budget) and a pass/fail score:
   e.g. URL Shortener, News Feed, Video Streaming, Ride-hailing, Chat, Flash Sale.
   Plus starter TEMPLATES that load a full working architecture.
10. 3D VIEW: nodes as distinct 3D shapes on region "platforms", glowing by utilisation
    (green → amber → red), particles flowing along edges with density proportional to RPS and red
    particles for errors, failed nodes greyed and flickering, orbit/zoom camera, click to select.
11. DASHBOARD: throughput, success rate, avg + p99 latency, monthly cost, bottleneck, sparklines of
    the last N ticks.
12. PERSISTENCE & SHARING: autosave to localStorage, export/import JSON, share-via-URL (compressed
    hash), undo/redo.
</features>

<design>
Dark "blueprint" look: near-black navy background, cyan/teal accents, subtle grid, monospace for
numbers (tabular figures). Three-panel layout: palette left, canvas centre (2D | 3D | split toggle),
inspector right, metrics + recommendations + chaos in a bottom/side dock. Keyboard: Delete removes,
Space play/pause, Ctrl+Z / Ctrl+Shift+Z. Must remain usable at 1280x720. Respect prefers-reduced-motion.
</design>

<constraints>
- Client-only. NEVER add a server, auth, analytics, or paid API.
- The engine MUST live in src/sim/ and import nothing from React or the UI.
- Numbers are teaching approximations — show a small "model assumptions" panel explaining them.
- Only build what is listed. Do not add features beyond this spec without asking.
- Stop and ask before adding any dependency not listed in <stack>.
</constraints>

<done_when>
- `npm run build` passes with zero TypeScript errors and the /dist folder deploys on Vercel as-is.
- Loading any template shows non-zero traffic in both 2D and 3D views within 1 second.
- Killing the only database in a template drops success rate to ~0 % and a SPOF recommendation appears.
- Adding a cache in front of an overloaded DB visibly lowers DB utilisation and p99 latency.
- Moving the DB to a far region raises latency and adds egress cost.
- A share link reopened in a new tab restores the exact graph.
</done_when>
```

🎯 Target: Claude Code · 💡 Turned "make it like that site but better" into a concrete stack, a deterministic simulation model, measurable acceptance tests and scope locks, so an agent builds the sandbox in one pass instead of guessing.

> This prompt is for an agentic tool with real system access. Review the scope locks, forbidden actions and stop conditions before pasting. Confirm file paths and permissions match the actual project.

---

## What was added beyond the original idea

| Added | Why it matters for practising |
|---|---|
| Edge modes (split vs every-request) | Lets you model both load balancing and fan-out calls honestly |
| Queueing-theory latency (M/M/1) | Latency explodes near 100 % utilisation, like real systems |
| 24 h clock + traffic patterns | Shows why autoscaling and over-provisioning matter |
| Region-distance latency + egress cost | "Where is my DB?" becomes a visible cost/latency trade-off |
| Chaos list (reversible) | Practise failure scenarios the way interviews ask them |
| Rule-based recommendations w/ one-click fixes | Teaches *why*, not just *what* |
| Challenges with SLO + budget targets | Turns the sandbox into a game with a score |
| Share links | Free app can be shared without any backend |
