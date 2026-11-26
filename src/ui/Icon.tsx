import type { NodeKind } from '../sim/types'

/** Line icons drawn on a 24px grid, stroke = currentColor. One per component kind. */
const P: Record<NodeKind, JSX.Element> = {
  client: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M16 14.2c2.6-.2 4.2 1.4 4.6 4.3" />
    </>
  ),
  dns: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.3 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.3-3.8-8.5S9.4 5.9 12 3.5Z" />
    </>
  ),
  cdn: (
    <>
      <circle cx="12" cy="12" r="3" />
      <circle cx="4.5" cy="6" r="1.6" />
      <circle cx="19.5" cy="6" r="1.6" />
      <circle cx="4.5" cy="18" r="1.6" />
      <circle cx="19.5" cy="18" r="1.6" />
      <path d="M6 7l3.6 3M18 7l-3.6 3M6 17l3.6-3M18 17l-3.6-3" />
    </>
  ),
  edgefn: (
    <>
      <path d="M13 3 6 13.5h5.5L10.5 21 18 10h-5.5L13 3Z" />
    </>
  ),
  waf: (
    <>
      <path d="M12 3 4.5 6v5.5c0 4.5 3.1 8 7.5 9.5 4.4-1.5 7.5-5 7.5-9.5V6L12 3Z" />
      <path d="M8.8 12.2l2.2 2.2 4.2-4.4" />
    </>
  ),
  ratelimiter: (
    <>
      <path d="M4 16a8 8 0 1 1 16 0" />
      <path d="M12 16l4-5" />
      <path d="M4 19.5h16" />
    </>
  ),
  lb: (
    <>
      <circle cx="5" cy="12" r="2" />
      <path d="M7 12h4M11 12c2 0 3-5 6-5M11 12c2 0 3 5 6 5M11 12h6" />
      <path d="M17 7h2.5M17 12h2.5M17 17h2.5" />
    </>
  ),
  gateway: (
    <>
      <path d="M4 20V9.5L12 4l8 5.5V20" />
      <path d="M9 20v-6h6v6" />
    </>
  ),
  websocket: (
    <>
      <path d="M12 13v8" />
      <circle cx="12" cy="11" r="1.6" />
      <path d="M8.5 7.5a5 5 0 0 0 0 7M15.5 7.5a5 5 0 0 1 0 7M5.6 4.8a9 9 0 0 0 0 12.4M18.4 4.8a9 9 0 0 1 0 12.4" />
    </>
  ),
  app: (
    <>
      <rect x="4" y="4" width="16" height="6" rx="1.5" />
      <rect x="4" y="14" width="16" height="6" rx="1.5" />
      <path d="M7.5 7h.01M7.5 17h.01" />
    </>
  ),
  container: (
    <>
      <path d="M12 3.5 19.5 7.5v9L12 20.5 4.5 16.5v-9L12 3.5Z" />
      <path d="M4.5 7.5 12 11.5l7.5-4M12 11.5v9" />
    </>
  ),
  k8s: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M12 4v5.8M12 14.2V20M4.5 9.5l5.4 1.7M14.1 12.8l5.4 1.7M7 18.2l3.6-4.4M13.4 10.2 17 5.8" />
    </>
  ),
  serverless: (
    <>
      <path d="M7 4h2.5L17 20M12.5 11 7 20" />
    </>
  ),
  cache: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2.5" />
      <path d="M12.8 7.5 9.5 12.5h3.2l-1.5 4 3.3-5h-3.2l1.5-4Z" />
    </>
  ),
  sql: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="2.6" />
      <path d="M5 6v12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6M5 12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6" />
    </>
  ),
  nosql: (
    <>
      <circle cx="8" cy="12" r="3.5" />
      <path d="M11.5 12H20M17 12v3M20 12v2.5" />
    </>
  ),
  globaldb: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c-2.4 2.6-3.5 5.4-3.5 8.5s1.1 5.9 3.5 8.5M12 3.5c2.4 2.6 3.5 5.4 3.5 8.5s-1.1 5.9-3.5 8.5" />
      <circle cx="12" cy="12" r="1.8" />
    </>
  ),
  storage: (
    <>
      <path d="M5 7h14l-1.4 12.2a1.5 1.5 0 0 1-1.5 1.3H7.9a1.5 1.5 0 0 1-1.5-1.3L5 7Z" />
      <path d="M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </>
  ),
  queue: (
    <>
      <rect x="3.5" y="8" width="4" height="8" rx="1" />
      <rect x="10" y="8" width="4" height="8" rx="1" />
      <path d="M16.5 12h4M18.5 10l2 2-2 2" />
    </>
  ),
  pubsub: (
    <>
      <circle cx="6" cy="12" r="2.4" />
      <path d="M8.4 12h3M11.4 12l6-5.5M11.4 12h6.6M11.4 12l6 5.5" />
      <circle cx="18.5" cy="6" r="1.4" />
      <circle cx="19.5" cy="12" r="1.4" />
      <circle cx="18.5" cy="18" r="1.4" />
    </>
  ),
  stream: (
    <>
      <path d="M3.5 8c2.8-2 5.7-2 8.5 0s5.7 2 8.5 0M3.5 12.5c2.8-2 5.7-2 8.5 0s5.7 2 8.5 0M3.5 17c2.8-2 5.7-2 8.5 0s5.7 2 8.5 0" />
    </>
  ),
  worker: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.3M12 18.2v2.3M3.5 12h2.3M18.2 12h2.3M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6" />
    </>
  ),
  notify: (
    <>
      <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z" />
      <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  streamproc: (
    <>
      <path d="M4 5h16l-6 7.5V19l-4 1.5v-8L4 5Z" />
    </>
  ),
  warehouse: (
    <>
      <path d="M5 20V11M10 20V6M15 20v-8M20 20V4" />
      <path d="M3 20.5h18" />
    </>
  ),
  inference: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2" />
      <path d="M9.5 3v3M14.5 3v3M9.5 18v3M14.5 18v3M3 9.5h3M3 14.5h3M18 9.5h3M18 14.5h3" />
      <path d="M12 9.2l.9 1.9 1.9.9-1.9.9-.9 1.9-.9-1.9-1.9-.9 1.9-.9.9-1.9Z" />
    </>
  ),
  external: (
    <>
      <path d="M9 4v4.5M15 4v4.5M6.5 8.5h11V12a5.5 5.5 0 0 1-11 0V8.5Z" />
      <path d="M12 17.5V21" />
    </>
  ),
  auth: (
    <>
      <circle cx="8" cy="12" r="4" />
      <path d="M12 12h8.5M17.5 12v3M20.5 12v2" />
    </>
  ),
}

export function KindIcon({ kind, size = 18, className }: { kind: NodeKind; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {P[kind]}
    </svg>
  )
}
