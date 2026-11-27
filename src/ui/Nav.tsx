import { useApp } from '../store'
import { useRoute, type Page } from '../route'

const Ico = ({ d, size = 17 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
)

const PAGES: { id: Page; label: string; icon: string; hint: string }[] = [
  { id: 'learn', label: 'Learn', icon: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15ZM4 20.5A2.5 2.5 0 0 0 6.5 23H20M8 7h8', hint: 'Step-by-step lessons on a live board' },
  { id: 'library', label: 'Library', icon: 'M4 4h4v16H4zM10 4h4v16h-4zM16.5 4.6l3.8-1 3.7 15.5-3.8 1z', hint: 'Interview problems and how real companies build their systems' },
  { id: 'lab', label: 'Simulator', icon: 'M3 4h7v6H3zM14 14h7v6h-7zM14 4h7v6h-7zM6.5 10v4a2 2 0 0 0 2 2H14', hint: 'Build, run and break your own design' },
]

/** The app-wide bar: brand, the three pages, theme and help. */
export function Nav() {
  const page = useRoute((s) => s.page)
  const go = useRoute((s) => s.go)
  const theme = useApp((s) => s.theme)
  const toggleTheme = useApp((s) => s.toggleTheme)
  const setHelp = useApp((s) => s.setHelp)
  return (
    <nav className="nav" aria-label="Main">
      <a className="brand" href="#/lab" aria-label="ArchSim: open the simulator" onClick={(e) => { e.preventDefault(); go({ page: 'lab' }) }}>
        <span className="brand-mark" aria-hidden>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="6" height="5" rx="1.5" />
            <rect x="15" y="4" width="6" height="5" rx="1.5" />
            <rect x="9" y="15" width="6" height="5" rx="1.5" />
            <path d="M6 9v2.5c0 1 .8 1.5 1.8 1.5H12m6-4v2.5c0 1-.8 1.5-1.8 1.5H12m0 0v2" />
          </svg>
        </span>
        <span>ArchSim</span>
      </a>
      <div className="nav-pages">
        {PAGES.map((p) => (
          <a
            key={p.id}
            href={`#/${p.id}`}
            className={`nav-page ${page === p.id ? 'on' : ''}`}
            aria-current={page === p.id ? 'page' : undefined}
            title={p.hint}
            onClick={(e) => { e.preventDefault(); go({ page: p.id }) }}
          >
            <Ico d={p.icon} />
            <span>{p.label}</span>
          </a>
        ))}
      </div>
      <div className="nav-tools">
        <button className="tbtn" onClick={toggleTheme} aria-label={theme === 'light' ? 'Switch to night mode' : 'Switch to day mode'} title={theme === 'light' ? 'Night mode' : 'Day mode'}>
          {theme === 'light' ? <Ico d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /> : <Ico d="M12 3v2M12 19v2M5 12H3M21 12h-2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />}
        </button>
        <button className="tbtn" onClick={() => setHelp(true)} aria-label="Help" title="How to use ArchSim">
          <Ico d="M9.2 9a3 3 0 0 1 5.6 1.2c0 2-2.8 2.4-2.8 4.3M12 17.6v.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" />
        </button>
        <a className="tbtn hide-narrow" href="https://github.com/UsmanQasim/Archsim" target="_blank" rel="noreferrer" aria-label="Source code on GitHub" title="Source code on GitHub">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.08.63-1.33-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z" /></svg>
        </a>
      </div>
    </nav>
  )
}
