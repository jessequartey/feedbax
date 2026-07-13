import { useEffect, useState, type CSSProperties, type PropsWithChildren } from 'react'

export interface PortalBranding {
  readonly name: string
  readonly tagline: string
  readonly mark: string
  readonly accent: string
  readonly logoUrl?: string
  readonly supportUrl: string
}

type Page = 'feedback' | 'roadmap' | 'changelog'
const navigation: ReadonlyArray<{ id: Page; label: string; href: string }> = [
  { id: 'feedback', label: 'Feedback', href: '/' },
  { id: 'roadmap', label: 'Roadmap', href: '/roadmap' },
  { id: 'changelog', label: 'Changelog', href: '/changelog' },
]

function Icon({ name }: { name: 'menu' | 'close' | 'sun' | 'moon' | 'arrow' | 'vote' }) {
  const paths = {
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
    moon: <path d="M20 15.2A8.5 8.5 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z" />,
    arrow: <><path d="M5 12h14M14 7l5 5-5 5" /></>,
    vote: <><path d="m12 5 5 6h-3v7h-4v-7H7l5-6Z" /></>,
  }
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

function ThemeControl() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  useEffect(() => {
    const saved = localStorage.getItem('feedbax-theme')
    const next = saved === 'dark' || (!saved && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light'
    setTheme(next)
    document.documentElement.dataset.theme = next
  }, [])
  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    document.documentElement.dataset.theme = next
    localStorage.setItem('feedbax-theme', next)
  }
  return <button className="icon-button" type="button" onClick={toggle} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}><Icon name={theme === 'light' ? 'moon' : 'sun'} /></button>
}

export function PortalShell({ branding, activePage, wide = false, children }: PropsWithChildren<{ branding: PortalBranding; activePage: Page; wide?: boolean }>) {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div className="portal" data-wide={wide || undefined} style={{ '--brand-accent': branding.accent } as CSSProperties}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="site-header">
        <div className="header-inner">
          <a className="brand" href="/" aria-label={`${branding.name} home`}>
            {branding.logoUrl ? <img src={branding.logoUrl} alt="" /> : <span className="brand-mark" aria-hidden="true">{branding.mark}</span>}
            <span>{branding.name}</span>
          </a>
          <nav className="desktop-nav" aria-label="Primary navigation">
            {navigation.map((item) => <a key={item.id} href={item.href} aria-current={item.id === activePage ? 'page' : undefined}>{item.label}</a>)}
          </nav>
          <div className="header-actions">
            <ThemeControl />
            <button className="user-menu" type="button" aria-label="Open user menu"><span aria-hidden="true">JQ</span><span className="user-name">Jesse</span><span aria-hidden="true">⌄</span></button>
            <button className="icon-button mobile-menu-button" type="button" aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}><Icon name={menuOpen ? 'close' : 'menu'} /></button>
          </div>
        </div>
        <nav id="mobile-navigation" className="mobile-nav" data-open={menuOpen || undefined} aria-label="Mobile navigation">
          {navigation.map((item) => <a key={item.id} href={item.href} aria-current={item.id === activePage ? 'page' : undefined}>{item.label}</a>)}
        </nav>
      </header>
      <main id="main-content">{children}</main>
      <footer><p>Powered by <strong>{branding.name}</strong></p><a href={branding.supportUrl}>Get support</a></footer>
    </div>
  )
}

export function PortalLoading({ activePage = 'feedback', wide = false }: { activePage?: Page; wide?: boolean } = {}) {
  return <PortalShell branding={portalBrandingFallback} activePage={activePage} wide={wide}><section className="state-page" aria-live="polite" aria-busy="true"><div className="loader" /><p className="eyebrow">Loading {activePage}</p><h1>Getting the latest updates…</h1><p>This should only take a moment.</p><div className="skeleton-lines"><span /><span /><span /></div></section></PortalShell>
}

const portalBrandingFallback: PortalBranding = { name: 'Feedbax', tagline: '', mark: 'F', accent: '#2563eb', supportUrl: 'mailto:support@feedbax.dev' }

export function ConnectorOutage({ onRetry, activePage = 'feedback', wide = false }: { onRetry: () => void; activePage?: Page; wide?: boolean }) {
  return <PortalShell branding={portalBrandingFallback} activePage={activePage} wide={wide}><section className="state-page outage" role="alert"><span className="outage-mark" aria-hidden="true">!</span><p className="eyebrow">Connection interrupted</p><h1>{activePage === 'roadmap' ? 'The roadmap' : 'Feedback'} is temporarily unavailable</h1><p>We couldn’t reach the connected workspace. Your account and existing feedback are safe.</p><div className="state-actions"><button className="primary-button" type="button" onClick={onRetry}>Try again</button><a href={portalBrandingFallback.supportUrl}>Contact support</a></div></section></PortalShell>
}
