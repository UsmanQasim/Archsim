# Contributing to ArchSim

Thanks for helping. Most useful contributions fall into one of these:

- **A new challenge.** Add one object to `src/sim/challenges.ts`: a brief, targets, design checks and a staged reference solution. Run `npm test`; the suite checks that your solution passes its own targets and that the starting board does not.
- **A new component.** Add it to `NodeKind` in `src/sim/types.ts` and describe it in `src/sim/catalog.ts`: AWS, Google Cloud and Azure names, capacity, latency, price, the fields it shows, when to use it and its trade-offs. Give it an icon in `src/ui/Icon.tsx`.
- **An advisor rule.** Rules live in `src/sim/advisor.ts`. A good rule names the exact part, says why it matters in one sentence, and offers a one-click fix when there is an obvious one.
- **Better numbers.** If a latency, capacity or price is off, change it in `catalog.ts` or `engine.ts` and link your source in the pull request.
- **Bugs and rough edges** in the UI, especially on phones and tablets.

## Setup

```bash
npm install
npm run dev
```

Before you open a pull request:

```bash
npm run typecheck
npm test
npm run build
```

## Style

- Keep the engine (`src/sim/`) free of React and the DOM.
- Interface text is plain and specific: sentence case, no jargon where a plain word works, and buttons that say what they do ("Take region offline", not "Submit").
- Colours and spacing come from the CSS variables at the top of `src/styles.css`, in both day and night themes.

## Pull requests

Small and focused is easiest to review. Say what changed and why, and add a screenshot for anything visible.
