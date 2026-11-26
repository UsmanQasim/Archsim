# Copilot instructions for ArchSim

Read `SKILL.md` and `AGENTS.md` before architecture design or repository changes.

Use only the node kinds, regions, edge modes, and configuration fields defined by `src/sim/catalog.ts`, `src/sim/types.ts`, and `src/sim/regions.ts`. Use `defaultConfig(kind, patch)` for generated graphs. Preserve the versioned JSON format in `src/store.ts`.

For system design requests:

1. State assumptions.
2. Explain the request and data flow.
3. Explain choices and alternatives.
4. Give capacity, cost, latency, and availability expectations.
5. Identify risks and mitigations.
6. Recommend ArchSim validation tests.
7. Produce importable ArchSim JSON when a generated design is useful.

For code changes, make the smallest complete change and run `npm run build`.
