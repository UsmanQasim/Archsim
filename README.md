<div align="center">

<img src="public/icon.svg" width="64" height="64" alt="" />

# ArchSim

**A system design simulator you can break.**

Sketch an architecture on a whiteboard, then watch traffic, latency, outages and the monthly bill react, live.
Free, open source, runs entirely in your browser.

**[Open ArchSim](https://archsim-pi.vercel.app/)** · [Watch the 70-second demo](docs/archsim-demo.mp4) · [How it works](docs/ARCHITECTURE.md)

[![CI](https://github.com/UsmanQasim/Archsim/actions/workflows/ci.yml/badge.svg)](https://github.com/UsmanQasim/Archsim/actions/workflows/ci.yml)
[![MIT licence](https://img.shields.io/badge/licence-MIT-2457c5)](LICENSE)
![No backend](https://img.shields.io/badge/backend-none-2f8a4c)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6)
![Works offline](https://img.shields.io/badge/PWA-works%20offline-6b4fbb)

<img src="docs/demo.gif" alt="Taking a region offline: requests from three cities start failing, the board turns red, then recovers" width="900" />

</div>

## Why

Most system design practice is reading. You draw boxes, you say "add a cache", and nobody checks whether it would have worked. ArchSim checks. Every box has a capacity, a latency, a failure mode and a price, so you find out that your single database tops out at 3k writes a second, that the cross-region call adds 68 ms, and that the CDN is most of the bill.

- **Build** from 29 components: load balancers, autoscaling groups, Kubernetes, Lambda, Redis, SQL and NoSQL, global databases, queues, streams, Flink-style processors, warehouses, GPU inference, Stripe and OpenAI as external APIs.
- **Tune** everything: region, instance size, replicas, shards, Multi-AZ, cache hit rate, users per city, read/write mix, payload, traffic shape.
- **Break it**: lose a zone, lose a whole region, kill a node, cut a link, add latency, multiply traffic by ten, flush every cache.
- **See the bill**: per-component monthly cost with tiered data transfer, and a cost tab that finds reserved, spot, ARM and billing-model savings.
- **Practise** 52 interview problems, from a pastebin to a bank ledger, each with targets, design checks and a step-by-step reference solution. Filter by topic and difficulty, and track what you've solved.
- **Learn** one idea at a time: eight short lessons (latency, scaling, caching, replication, queues, sharding, CDNs, retries), each with a broken system to fix and a live check.
- **Interview** with it: write your own challenge from a board, send it as a link, and get the candidate's design, scores and notes back as a link. No accounts, no server.

## Screenshots

| | |
|---|---|
| ![Board with a running global feed](docs/screenshots/hero.png) **The board.** Every number on every box is live. | ![3D model of the same system](docs/screenshots/model.png) **The model.** The same system as a 3D table model, regions as plates. |
| ![World map](docs/screenshots/map.png) **The map.** Where users are, where their requests land, and what crosses an ocean. | ![A region outage](docs/screenshots/chaos.png) **Chaos.** One click takes N. Virginia offline. |
| ![Guided solution](docs/screenshots/guide.png) **Guided solutions.** Rebuild the reference design one step at a time, with the reasoning. | ![Growth plan](docs/screenshots/growth.png) **The next 12 months.** Which month the design breaks, and which month it blows the budget. |
| ![Problem bank](docs/screenshots/problems.png) **52 problems.** Filter by topic and difficulty, solve, or rebuild the answer step by step. | ![Challenge editor](docs/screenshots/editor.png) **Write your own.** Capture the answer from the board, set targets and checks, send a link. |
| ![A lesson in progress](docs/screenshots/lesson.png) **Lessons.** One idea, one broken system, one live check. | ![Practice mode in dark theme](docs/screenshots/practice-dark.png) **Practice mode.** A timed mock interview with notes for each stage. |
| <img src="docs/screenshots/phone-board.png" width="48%" alt="Phone layout: the board" /> <img src="docs/screenshots/phone-details.png" width="48%" alt="Phone layout: component details" /> **Phones and tablets.** Panels slide in. | |

## Everything it does

| Area | What you get |
|---|---|
| Clouds | Switch AWS, Google Cloud or Azure and every component shows that cloud's product name. The details panel says when to use it and what it costs you. |
| Routing | *Split* connections share load and fail over; *every request* connections are calls made each time. Connections can carry only reads or only writes, retry, and trip a circuit breaker. GeoDNS and CDNs send each city to its nearest healthy region. |
| Simulation | A 24-hour clock with daily waves, flash spikes and growth. Queueing latency, overload drops, autoscaling lag, queue backlogs, retry storms, per-city latency. |
| Advisor | Single points of failure, missing Multi-AZ, hot spots, retry storms, cross-region data calls, a warehouse on the request path. Most come with a one-click fix. |
| Stress tests | *Breaking point* ramps traffic until something gives and names it. *A full day* replays 24 hours minute by minute. *The next 12 months* grows traffic month by month against your budget. |
| Where the time goes | Pick a group of users to see every hop of an average request: network time, time inside each part, and what share of requests get there. |
| Compare | Save versions of a design and compare latency, availability, cost and bottleneck side by side. |
| Estimate | Back-of-envelope maths from daily users to peak requests, bandwidth, storage and rough server counts, then one click to turn it into users on the board. |
| Problems | 52 problems in 18 topics, Easy to Hard, with search, filters and progress. Each has a reference solution you can rebuild step by step. |
| Learn | Eight lessons, one concept each. Every lesson loads a board and a task, and ticks the task off the moment the simulation shows it worked. |
| For interviewers | Build the answer on the board, capture it as solution steps, set targets and design checks (or let ArchSim set targets from your answer), test it, and copy a challenge link. The candidate presses *Send to interviewer* and you get a result link that opens their design with the 24-hour test results, the checks and their notes. Challenges also export and import as JSON. |
| Practice | 35, 45 or 60 minute mock interviews in five stages with prompts, a timer and a scored summary. Passed challenges are ticked. |
| Editing | Sticky notes, quick add (`Ctrl K`), copy, paste, duplicate, multi-select, tidy up, undo and redo, day and night themes. |
| Sharing | Autosave, share links that hold the whole design, JSON import and export, PNG export of the board, and a Markdown design doc with your notes. |
| Anywhere | Works on phones and tablets, installs as an app, and keeps working offline after the first visit. |

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # engine tests, including every challenge's reference solution
npm run lint       # ESLint
npm run build      # type-check and build into dist/
npm run e2e        # browser tests and accessibility checks against the build (Playwright)
```

Node 20 or newer.

## Deploy your own

It is a static site with no backend, database or keys.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FUsmanQasim%2FArchsim)

- **Vercel**: use the button, or import the repo. It detects Vite (`npm run build`, output `dist`). `vercel.json` already has the SPA rewrite.
- **Netlify, Cloudflare Pages, GitHub Pages**: build command `npm run build`, publish directory `dist`. The build uses relative paths, so it works from a sub-folder.

After deploying your own copy, change the `og:url`, `og:image` and `twitter:image` addresses in `index.html` to your domain so link previews show the picture.

## How it works

The simulation is a pure TypeScript engine in [`src/sim`](src/sim) with no React in it. Each tick it pushes traffic from every group of users through the graph in order, works out each component's load, latency, failures and cost, and feeds retries back into the next tick. [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains the model, its assumptions and where the numbers come from.

```
src/sim/          the engine: no UI, fully unit-tested
  engine.ts       traffic, latency, failures, autoscaling, cost, the 24-hour test
  analysis.ts     steady state, breaking point, growth plan, per-hop trace
  catalog.ts      the 29 components: cloud names, pricing, fields, trade-offs
  advisor.ts      recommendation rules and their fixes
  challenges.ts   the classic problems, plus the registry for custom ones
  problems.ts     more problems, written in the declarative challenge format
  spec.ts         the challenge format: build, check, diff boards into steps
  regions.ts      regions, cities and distance-based latency
src/store.ts      app state, undo and redo, autosave, share links
src/share.ts      challenge links and result links
src/learn.ts      the lessons
src/ui/           board, 3D model, world map, panels
```

The numbers are teaching approximations, not a capacity plan: about 1 ms of round trip per 100 km, M/D/1-style queueing, tail latency combined along a path, list-price ballparks. They are all in `engine.ts` and `catalog.ts` if you want to argue with them, and [docs/NUMBERS.md](docs/NUMBERS.md) lists each one next to the published figure it is based on.

## Designs as files

Every design is a small JSON document that you can export, import, keep in a repo or generate from a script. Share links carry the same JSON in the address. Challenges are JSON too, so a team can keep its interview problems in a repo. [docs/FORMAT.md](docs/FORMAT.md) describes both, and tests keep the examples working.

## Quality

Every push runs ESLint, the type checker, over 100 engine tests (every challenge's reference solution must pass its own targets, its starting board must not, and every challenge must survive a round trip through the editor) and 20 browser tests on desktop and phone sizes, including automated accessibility checks in both themes. Lighthouse on the production build scores 100 for accessibility, best practices and SEO, 100 for desktop performance and about 90 for mobile performance.

## Contributing

New challenges, components, advisor rules and better numbers are all welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md). A new challenge is one object in `src/sim/problems.ts` (or build it in the app under *Problems → Create a challenge* and download the JSON), and the test suite automatically checks that its reference solution passes.

## Licence

[MIT](LICENSE)
