import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router'
import { Logo } from '@/components/ui/Logo'

const NAV = [
  { to: '/library', label: 'Library' },
  { to: '/studio', label: 'Studio' },
  { to: '/academy', label: 'Academy' },
  { to: '/analytics', label: 'Analytics' },
]

const TITLES: Record<string, string> = {
  '/': 'Conduct Your Own Orchestra',
  '/library': 'Library',
  '/studio': 'Conducting Studio',
  '/academy': 'Conducting Academy',
  '/analytics': 'Analytics',
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `px-1 py-2 text-sm tracking-wide transition-colors ${isActive ? 'text-gold' : 'text-ivory-dim hover:text-ivory'}`

export function Layout() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const studio = pathname === '/studio'
  useEffect(() => {
    const t = TITLES[pathname]
    document.title = t ? `${t} — MAESTRO` : 'Page not found — MAESTRO'
  }, [pathname])
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-gold focus:px-3 focus:py-2 focus:text-ink-950">
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b hairline bg-ink-950/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link to="/" aria-label="MAESTRO home" onClick={() => setOpen(false)}>
            <Logo />
          </Link>
          <nav aria-label="Primary" className="hidden items-center gap-8 md:flex">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={linkClass}>
                {n.label}
              </NavLink>
            ))}
            <Link to="/studio" className="btn btn-gold !py-2">Start Conducting</Link>
          </nav>
          <button
            className="btn btn-ghost !px-3 !py-2 md:hidden"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? 'Close' : 'Menu'}
          </button>
        </div>
        {open && (
          <nav id="mobile-nav" aria-label="Mobile" className="flex flex-col gap-1 border-t hairline px-4 py-3 md:hidden">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={linkClass} onClick={() => setOpen(false)}>
                {n.label}
              </NavLink>
            ))}
          </nav>
        )}
      </header>
      <main id="main" className="flex-1">
        <Outlet />
      </main>
      {!studio && <Footer />}
      <ScrollRestoration />
    </div>
  )
}

function Footer() {
  return (
    <footer className="border-t hairline">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-3">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm text-ivory-mute">Conduct Your Own Orchestra. A university computer-engineering project.</p>
        </div>
        <div className="text-sm text-ivory-dim">
          <p className="eyebrow mb-3">Privacy</p>
          <p>Camera frames are processed locally in your browser and are never uploaded. There is no backend.</p>
        </div>
        <div className="text-sm text-ivory-dim">
          <p className="eyebrow mb-3">Explore</p>
          <ul className="space-y-1">
            {NAV.map((n) => (
              <li key={n.to}><Link className="hover:text-gold" to={n.to}>{n.label}</Link></li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  )
}
