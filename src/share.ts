import { compressToEncodedURIComponent } from 'lz-string'
import { runDay } from './sim/engine'
import { findChallenge } from './sim/scenarios'
import type { ChallengeSpec } from './sim/spec'
import { serialize, useApp, type Saved } from './store'

/** What a candidate sends back to an interviewer: their design, notes and how it did. */
export interface ResultPayload {
  v: 1
  challengeId: string
  title: string
  candidate?: string
  /** included for challenges that are not built in, so the link works anywhere */
  spec?: ChallengeSpec
  design: Saved
  submittedAt: number
  minutesTaken?: number
  notes?: Record<string, string>
  report: {
    p99: number
    availability: number
    cost: number
    backlogSec: number
    targets: { p99: number; availability: number; budget: number; backlogSec?: number }
    checks: { label: string; ok: boolean }[]
  }
}

const base = () => `${location.origin}${location.pathname}`

export function challengeLink(spec: ChallengeSpec) {
  return `${base()}#c=${compressToEncodedURIComponent(JSON.stringify(spec))}`
}

export function resultLink(r: ResultPayload) {
  return `${base()}#r=${compressToEncodedURIComponent(JSON.stringify(r))}`
}

/** Score the board as it stands against the active challenge, with a full 24-hour test. */
export function buildResult(candidate: string): ResultPayload | null {
  const s = useApp.getState()
  const ch = findChallenge(s.challengeId)
  if (!ch) return null
  const day = runDay(s.nodes, s.edges, s.chaos, 120)
  const g = { nodes: s.nodes, edges: s.edges }
  const iv = s.interview
  return {
    v: 1,
    challengeId: ch.id,
    title: ch.title,
    candidate: candidate.trim().slice(0, 60) || undefined,
    spec: ch.spec && ch.author ? ch.spec : undefined,
    design: serialize(s),
    submittedAt: Date.now(),
    minutesTaken: iv && iv.challengeId === ch.id ? Math.round(((iv.finishedAt ?? Date.now()) - iv.startedAt) / 60000) : undefined,
    notes: iv && iv.challengeId === ch.id ? iv.notes : undefined,
    report: {
      p99: day.dayP99,
      availability: day.dayAvailability,
      cost: day.avgMonthlyCost,
      backlogSec: day.maxBacklogSec,
      targets: ch.targets,
      checks: ch.checks.map((c) => ({ label: c.label, ok: c.test(g) })),
    },
  }
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
