# How ArchSim works

ArchSim has two halves that never import each other's internals:

- **The engine** (`src/sim/`): plain TypeScript functions. Given a graph and a moment in time, it returns what every component and connection is doing. No React, no DOM, so it runs the same in the browser, in tests and in a script.
- **The app** (`src/store.ts`, `src/simLoop.ts`, `src/ui/`): holds the design, calls the engine ten times a second, and draws the result on the board, the 3D model and the map.

## The graph

A design is a list of nodes and edges.

- A **node** has a `kind` (one of the 29 in `catalog.ts`), a label and a config: region, size, instances, autoscaling bounds, replicas, shards, Multi-AZ, cache hit rate, pricing model and so on. Users are nodes too (`kind: 'client'`) with a location, a population, requests per user per minute, a read share and a traffic pattern.
- An **edge** has a mode and a filter. A `split` edge shares traffic with its siblings by weight and skips dead targets (that is how load balancers, replicas and failover work). An `all` edge receives every request (a call the parent makes each time). The filter limits an edge to reads or writes, which is how you send writes to a primary and reads to replicas. Edges can also retry and carry a circuit breaker.

## One tick

`step()` in `engine.ts` does this, in order:

1. **Traffic in.** Each group of users produces reads and writes per second, scaled by its pattern for the time of day (a daily wave peaking at 16:00, a flash spike at noon, or steady growth).
2. **Propagate.** Nodes are visited in topological order. Each node receives load from its parents, takes what it can serve, and passes the rest on. Caches and CDNs absorb their hit rate of reads; queues accept instantly and drain at the workers' pace. GeoDNS and CDNs route each user location to its nearest healthy region, so the engine evaluates global nodes once per location.
3. **Capacity and latency.** Utilisation is load divided by capacity (instances × per-instance throughput × size multiplier). Latency inside a node follows M/D/1 queueing, so it climbs steeply as utilisation nears 100 %. Above that the excess is dropped.
4. **Paths.** Network time between two places is about 1 ms per 100 km of great-circle distance plus 2 ms. Along a path the mean latencies add and the tails combine like variances, which gives a realistic p99 without simulating individual requests.
5. **Failures.** Chaos settings (a dead node, a lost zone, a lost region, a cut link, added delay) are applied. Retries multiply load on a struggling target using last tick's success rate, which is what makes retry storms appear. A tripped circuit breaker stops the retries.
6. **Autoscaling.** Groups with autoscaling move toward the instance count their load needs, with a delay and a cooldown, so a spike hurts before it is absorbed.
7. **Cost.** Each node's monthly cost comes from its instances (with reserved, spot and ARM discounts), its requests, and the bytes it sends. Data transfer is billed in tiers to users and per GB between regions.

The result is a `SimResult`: metrics per node and per edge, plus totals (requests per second, success rate, average and p99 latency, monthly cost, worst backlog).

## Built on top of a tick

`analysis.ts` and `runDay()` reuse `step()`:

- **Steady state** runs 40 simulated minutes at 16:00 so autoscaling settles, then reads the numbers. Everything that compares designs (Compare, the growth plan, the breaking point) uses it, so the comparisons are fair.
- **Breaking point** multiplies traffic by 1.5, 2, 3 … up to 20 until availability or p99 falls apart, and names the part that gave out.
- **The next 12 months** compounds a monthly growth rate and reports the first month that misses the targets and the first month over budget.
- **The 24-hour test** steps through a whole day and reports the day's p99, availability, average cost and worst queue backlog. Challenges are judged on this.
- **The trace** walks one group of users' requests hop by hop to show where the time goes.

## Challenges

Each challenge in `challenges.ts` has targets (p99, availability, monthly budget, sometimes backlog), design checks (functions over the graph, such as "file bytes bypass the app servers"), and a staged reference solution. The solution is built with a small builder that adds, links and retires parts step by step, so the guide can show each step on the board.

`src/sim/__tests__/challenges.test.ts` runs every reference solution through the 24-hour test and fails if it misses its own targets, and also checks that no challenge starts out already solved. If you change a number in the engine or the catalog, the tests tell you which challenges you made unfair.

## Where the numbers come from

They are teaching approximations, tuned so that the classic answers behave the way interviewers expect:

- Per-instance throughput and latency for each component, and list-price ballparks for 2026, are in `catalog.ts`.
- The rules above are listed in plain words in the app under **How the numbers are worked out** (the `ASSUMPTIONS` list in `engine.ts`).

If you know a better number, change it, run `npm test`, and open a pull request with your source.
