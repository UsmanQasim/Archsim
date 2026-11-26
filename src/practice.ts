export interface Phase {
  id: string
  title: string
  /** share of the session */
  share: number
  prompts: string[]
}

export const PHASES: Phase[] = [
  {
    id: 'requirements',
    title: 'Requirements',
    share: 0.11,
    prompts: [
      'Who uses it, and what are the two or three things they do most?',
      'What is in scope, and what are you leaving out?',
      'Is it read-heavy or write-heavy? Where does it need strong consistency?',
      'What availability and latency does it need?',
    ],
  },
  {
    id: 'estimates',
    title: 'Estimates',
    share: 0.11,
    prompts: [
      'Daily active users, and requests per second at the busiest time',
      'How much data a year, and how big one record is',
      'Bandwidth in and out. The Estimate tab does the arithmetic.',
    ],
  },
  {
    id: 'high-level',
    title: 'High-level design',
    share: 0.33,
    prompts: [
      'Put the main path from user to data on the board',
      'Name the API calls and what each one reads or writes',
      'Pick the data store and say why it fits',
    ],
  },
  {
    id: 'deep-dive',
    title: 'Deep dive',
    share: 0.27,
    prompts: [
      'Pick the hardest part and go deep on it',
      'Data model, keys, and how you shard it',
      'What you cache, for how long, and how it stays fresh',
    ],
  },
  {
    id: 'bottlenecks',
    title: 'Bottlenecks and trade-offs',
    share: 0.18,
    prompts: [
      'Run the stress tests. Where does it break first?',
      'What happens when a zone or a whole region goes down?',
      'What it costs, and what you would change with more time',
    ],
  },
]

/** [start, end) in seconds for each phase of a session this long */
export function phaseWindows(minutes: number): { id: string; start: number; end: number }[] {
  let t = 0
  return PHASES.map((p) => {
    const start = t
    t += p.share * minutes * 60
    return { id: p.id, start, end: t }
  })
}

export const fmtTimer = (sec: number) => {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
