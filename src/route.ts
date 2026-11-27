/**
 * Pages live in the hash, so links work on any static host:
 *   #/learn            the course        #/learn/<lesson>
 *   #/library          problems + companies; #/library/<tab>; #/library/company/<id>
 *   #/lab              the simulator (also any #g= #c= #r= design, challenge or result link)
 */
import { create } from 'zustand'

export type Page = 'learn' | 'library' | 'lab'
export interface Route {
  page: Page
  /** e.g. lesson id, library tab */
  a?: string
  /** e.g. company id */
  b?: string
}

export function parseRoute(hash: string): Route {
  if (!hash.startsWith('#/')) return { page: 'lab', a: undefined, b: undefined }
  const [page, a, b] = hash.slice(2).split('/').map(decodeURIComponent)
  if (page === 'learn' || page === 'library') return { page, a: a || undefined, b: b || undefined }
  return { page: 'lab', a: undefined, b: undefined }
}

export const routeHash = (r: Route) => `#/${[r.page, r.a, r.b].filter(Boolean).map((x) => encodeURIComponent(x!)).join('/')}`

export const useRoute = create<Route & { go: (r: Route | string) => void }>((set) => ({
  ...parseRoute(typeof location === 'undefined' ? '' : location.hash),
  go: (r) => {
    const next = typeof r === 'string' ? parseRoute(r) : r
    const hash = routeHash(next)
    if (location.hash !== hash) history.pushState(null, '', hash)
    set({ page: next.page, a: next.a, b: next.b })
    window.scrollTo?.(0, 0)
  },
}))

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => useRoute.setState(parseRoute(location.hash), false))
  window.addEventListener('hashchange', () => useRoute.setState(parseRoute(location.hash), false))
}
