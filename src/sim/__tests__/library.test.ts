import { describe, expect, it } from 'vitest'
import { ARTICLES } from '../../library/articles'
import { COMPANY_SPECS } from '../companies'
import { CHALLENGES } from '../challenges'

describe('company case studies', () => {
  it('every article has a runnable challenge, and every company challenge has an article', () => {
    for (const a of ARTICLES) expect(CHALLENGES.some((c) => c.id === a.challenge), a.id).toBe(true)
    for (const s of COMPANY_SPECS) expect(ARTICLES.some((a) => a.challenge === s.id), s.id).toBe(true)
  })

  it('ids are unique', () => {
    expect(new Set(ARTICLES.map((a) => a.id)).size).toBe(ARTICLES.length)
    expect(new Set(CHALLENGES.map((c) => c.id)).size).toBe(CHALLENGES.length)
  })

  it('every citation points at a listed https source', () => {
    for (const a of ARTICLES) {
      expect(a.sources.length, a.id).toBeGreaterThan(0)
      for (const s of a.sources) expect(s.url.startsWith('https://'), `${a.id} ${s.url}`).toBe(true)
      for (const n of a.numbers) expect(a.sources[n.src - 1], `${a.id} number ${n.value}`).toBeTruthy()
      const text = a.sections.flatMap((s) => s.body).join(' ')
      for (const m of text.matchAll(/\[(\d+)\]/g)) expect(a.sources[Number(m[1]) - 1], `${a.id} [${m[1]}]`).toBeTruthy()
    }
  })
})
