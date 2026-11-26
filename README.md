# ArchSim

**A visual system design simulator for exploring scalable, resilient cloud architectures.**

ArchSim turns system design diagrams into live simulations. Build with AWS, Google Cloud, or Azure components, route realistic traffic through the architecture, and immediately see how your choices affect latency, availability, throughput, cost, and failure behavior.

## Build an architecture

Create systems on an interactive node-based canvas with 29 infrastructure components across edge, compute, data, messaging, analytics, AI, and external services.

- Drag and connect load balancers, servers, caches, queues, databases, streams, and third-party APIs
- Switch between AWS, Google Cloud, and Azure product names
- Configure regions, instances, replicas, shards, autoscaling, caching, consistency, retries, and failover
- Edit sticky notes, copy selections, undo changes, and automatically tidy layouts

## Explore it in 2D and 3D

View the same architecture as a familiar 2D node diagram or switch to an interactive 3D system view. A global map also shows where users are located, which regions serve their traffic, and how data moves between regions.

The live workspace shows:

- Request throughput and queue depth
- p50, p95, and p99 latency
- Error rates and availability
- Regional round-trip times
- Per-component monthly costs
- A hop-by-hop request latency breakdown

## Test how the system behaves

Change traffic patterns, scale infrastructure, or inject failures to see whether the design holds up.

- Run daily, growth, and flash-spike traffic patterns
- Lose a node, availability zone, region, link, or cache
- Add latency or increase traffic by up to 10x
- Observe retry storms, overload drops, queue backlogs, and autoscaling delays
- Identify single points of failure, hotspots, and unnecessary cross-region calls
- Receive targeted optimization suggestions with one-click fixes

## Find capacity and cost limits

Use built-in stress tests to discover the boundaries of a design:

- **Breaking point** steadily increases traffic until the first component fails
- **Full day** replays 24 hours of changing demand minute by minute
- **12-month forecast** projects growth against capacity and budget

The cost view estimates component, bandwidth, storage, and cross-region spending, while highlighting practical savings such as reserved capacity, spot instances, ARM compute, serverless services, and managed databases.

## Practice system design interviews

ArchSim includes 16 system design challenges, including URL Shorteners, Chat, Payments, Dropbox, Uber, YouTube, Notifications, and LLM Assistants.

Each challenge provides:

- Performance and availability targets
- A monthly cost budget
- Architecture design checks
- Hints and a guided reference solution
- A 24-hour validation test
- Progress tracking for completed challenges

Timed interview practice provides 35-, 45-, or 60-minute sessions with prompts for each interview stage, a timer, notes, and a final summary that can be exported as a design document.

## Compare and share designs

- Save architecture versions and compare latency, availability, cost, and bottlenecks
- Estimate traffic and storage from daily users
- Export and import designs as JSON
- Share a complete board through a URL
- Save a board image or download a Markdown design document
- Continue work through automatic local saving
