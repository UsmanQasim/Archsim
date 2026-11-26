---
name: archsim-system-design
description: Use this repository to design, review, explain, or generate an ArchSim system architecture.
---

Read the repository root `SKILL.md` before answering. Treat it as the canonical source for:

- supported node kinds and configuration fields
- region IDs and edge semantics
- architecture and data-flow patterns
- capacity, latency, cost, and failure modeling
- importable `.archsim.json` graph format
- required assumptions and validation reports

When requirements are incomplete, make and label sensible assumptions. Never invent a node kind or provider value outside `src/sim/catalog.ts`. Use existing helpers and the exact graph schema, then produce an importable design or modify the repository as requested.
