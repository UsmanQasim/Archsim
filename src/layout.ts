import { useEffect, useState } from 'react'
import { create } from 'zustand'

/** wide: three columns. compact: side panels slide in over the board. narrow: phone layout. */
export type Layout = 'wide' | 'compact' | 'narrow'

const NARROW = '(max-width: 760px)'
const COMPACT = '(max-width: 1180px)'

function current(): Layout {
  if (typeof window === 'undefined' || !window.matchMedia) return 'wide'
  if (window.matchMedia(NARROW).matches) return 'narrow'
  if (window.matchMedia(COMPACT).matches) return 'compact'
  return 'wide'
}

export function getLayout(): Layout {
  return current()
}

export function useLayout(): Layout {
  const [l, setL] = useState<Layout>(current)
  useEffect(() => {
    const qs = [window.matchMedia(NARROW), window.matchMedia(COMPACT)]
    const on = () => setL(current())
    qs.forEach((q) => q.addEventListener('change', on))
    return () => qs.forEach((q) => q.removeEventListener('change', on))
  }, [])
  return l
}

export type Drawer = 'palette' | 'inspector' | null

export const useDrawer = create<{ drawer: Drawer; open: (d: Drawer) => void; toggle: (d: Exclude<Drawer, null>) => void }>((set, get) => ({
  drawer: null,
  open: (d) => set({ drawer: d }),
  toggle: (d) => set({ drawer: get().drawer === d ? null : d }),
}))

/** Close the slide-in panel when the screen is small enough to use one. */
export function closeDrawerIfOverlay() {
  if (current() !== 'wide') useDrawer.getState().open(null)
}
