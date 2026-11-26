# AI agent guide for ArchSim

Use `SKILL.md` as the canonical operating guide for system design, architecture decisions, and ArchSim graph generation.

## Repository purpose

ArchSim is a client-only React/Vite system design simulator. It models architecture diagrams with a deterministic TypeScript engine and supports 2D, 3D, map, cost, chaos, challenge, interview, and stress-test views.

## Source of truth

- `src/sim/catalog.ts`: component kinds, defaults, cloud mappings, capacity, and pricing
- `src/sim/types.ts`: graph and configuration types
- `src/sim/engine.ts`: simulation assumptions and behavior
- `src/sim/analysis.ts`: steady-state, breaking-point, 24-hour, and trace analysis
- `src/sim/regions.ts`: valid regions and user locations
- `src/sim/scenarios.ts`: templates and graph construction
- `src/sim/challenges.ts`: challenge briefs and reference solutions
- `src/store.ts`: persisted and import/export graph format

## Agent rules

1. Use only node kinds and edge fields supported by the files above.
2. Infer a labeled baseline when requirements are missing; do not pretend assumptions are facts.
3. Put traffic sources, regions, and request paths in the model.
4. Separate synchronous serving, asynchronous work, and analytics.
5. Validate failure, retry, cache, capacity, cost, and consistency behavior.
6. Prefer existing helpers such as `defaultConfig`, `CATALOG`, `TEMPLATES`, and `CHALLENGES`.
7. For generated designs, produce valid ArchSim JSON with `v: 1`.
8. Preserve JSON and share-link compatibility when changing serialization.
9. Run `npm test` and `npm run build` after repository changes. The tests check that every challenge's reference solution still passes its own targets.

## Required architecture decision format

For a system design request, respond with:

- assumptions
- architecture and request/data flow
- major decisions and alternatives
- capacity and cost expectations
- risks and mitigations
- ArchSim validation plan

For a code request, make the smallest complete change and verify it.
