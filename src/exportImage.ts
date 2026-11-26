import { getNodesBounds, getViewportForBounds } from '@xyflow/react'
import { useApp } from './store'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Save the whole whiteboard (not just what is on screen) as a PNG. */
export async function exportBoardPng() {
  const s = useApp.getState()
  const all = [...s.notes, ...s.nodes]
  if (!all.length) {
    s.showToast('The board is empty. Add something first.')
    return
  }
  let restore: typeof s.view | null = null
  if (s.view !== '2d' && s.view !== 'split') {
    restore = s.view
    s.setView('2d')
    await wait(450)
  }
  const el = document.querySelector<HTMLElement>('.pane-2d .react-flow__viewport')
  if (!el) {
    s.showToast('Open the Board view to save it as an image.')
    return
  }
  try {
    const { toPng } = await import('html-to-image')
    const b = getNodesBounds(all)
    const w = Math.round(Math.min(3200, Math.max(900, b.width + 200)))
    const h = Math.round(Math.min(2200, Math.max(560, b.height + 200)))
    const vp = getViewportForBounds(b, w, h, 0.2, 1.25, 0.08)
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || '#ffffff'
    // resolve CSS-variable strokes to real colours; the image renderer can't see the variables
    const fixed: [SVGElement, string][] = []
    el.querySelectorAll<SVGElement>('.react-flow__edge-path, .edge-flow').forEach((p) => {
      fixed.push([p, p.style.stroke])
      p.style.stroke = getComputedStyle(p).stroke
    })
    el.classList.add('exporting')
    const url = await toPng(el, {
      backgroundColor: bg,
      width: w,
      height: h,
      pixelRatio: 2,
      style: { width: `${w}px`, height: `${h}px`, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` },
      filter: (n) => !(n instanceof HTMLElement && (n.classList.contains('react-flow__handle') || n.classList.contains('note-colors') || n.classList.contains('react-flow__resize-control'))),
    }).finally(() => {
      fixed.forEach(([p, v]) => (p.style.stroke = v))
      el.classList.remove('exporting')
    })
    const a = document.createElement('a')
    a.href = url
    a.download = `${(s.title || 'archsim').replace(/[^\w-]+/g, '-').toLowerCase()}.png`
    a.click()
    s.showToast('Board saved as an image.')
  } catch {
    s.showToast('Could not save the image. Try again with fewer components on screen.')
  } finally {
    if (restore) useApp.getState().setView(restore)
  }
}
