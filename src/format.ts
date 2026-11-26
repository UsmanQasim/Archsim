export function fmtNum(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '∞'
  const a = Math.abs(n)
  if (a >= 1e9) return `${(n / 1e9).toFixed(digits)}B`
  if (a >= 1e6) return `${(n / 1e6).toFixed(digits)}M`
  if (a >= 1e4) return `${(n / 1e3).toFixed(0)}k`
  if (a >= 1e3) return `${(n / 1e3).toFixed(digits)}k`
  if (a >= 100) return n.toFixed(0)
  if (a >= 10) return n.toFixed(digits === 0 ? 0 : 1)
  return n.toFixed(a === 0 ? 0 : 1)
}

export const fmtRps = (n: number) => `${fmtNum(n)}/s`

export function fmtMs(ms: number): string {
  if (!Number.isFinite(ms)) return '—'
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`
  if (ms >= 100) return `${ms.toFixed(0)} ms`
  return `${ms.toFixed(1)} ms`
}

export function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`
  if (n >= 1e4) return `$${(n / 1e3).toFixed(1)}k`
  if (n >= 100) return `$${Math.round(n).toLocaleString()}`
  return `$${n.toFixed(2)}`
}

export function fmtPct(x: number, digits = 1): string {
  if (!Number.isFinite(x)) return '—'
  const p = x * 100
  if (p >= 99.9 && p < 100) return `${p.toFixed(digits >= 2 ? digits : 2)}%`
  return `${p.toFixed(digits)}%`
}

export function fmtClock(t: number): string {
  const d = ((t % 86400) + 86400) % 86400
  const h = Math.floor(d / 3600)
  const m = Math.floor((d % 3600) / 60)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export const dayNumber = (t: number) => Math.floor(t / 86400) + 1

/** CSS colour (theme-aware) for a utilisation level */
export function utilColor(u: number, idle = false): string {
  if (idle) return 'var(--line-2)'
  if (u >= 0.85) return 'var(--red)'
  if (u >= 0.6) return 'var(--amber)'
  return 'var(--green)'
}

export const MARKERS = {
  light: { ok: '#2457c5', warn: '#b86e0a', bad: '#c8372d', good: '#1e8a4c', idle: '#c9d2ce' },
  dark: { ok: '#8fb1f5', warn: '#e8b264', bad: '#f18c80', good: '#7cc99c', idle: '#464d53' },
}

/** hex colour for three.js */
export function utilHex(u: number, idle: boolean, theme: 'light' | 'dark'): string {
  const m = MARKERS[theme]
  if (idle) return m.idle
  if (u >= 0.85) return m.bad
  if (u >= 0.6) return m.warn
  return m.good
}

export function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (p: number, sh: number) => (p >> sh) & 255
  const mix = (sh: number) => Math.round(ch(pa, sh) * (1 - t) + ch(pb, sh) * t)
  return `#${((mix(16) << 16) | (mix(8) << 8) | mix(0)).toString(16).padStart(6, '0')}`
}
