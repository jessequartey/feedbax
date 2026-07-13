import {
  useEffect,
  useState,
  type CSSProperties,
  type PropsWithChildren,
} from 'react'
import { portalBranding } from '../portal.config.js'
import { ApplicationState } from './application-state.js'

export type PortalBranding = typeof portalBranding
export type PortalPage = 'feedback' | 'roadmap' | 'changelog'

function Icon({ name }: { name: 'menu' | 'close' | 'sun' | 'moon' }) {
  const paths = {
    menu: (
      <>
        <path d="M4 7h16M4 12h16M4 17h16" />
      </>
    ),
    close: (
      <>
        <path d="m6 6 12 12M18 6 6 18" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </>
    ),
    moon: <path d="M20 15.2A8.5 8.5 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z" />,
  }
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  )
}

function currentTheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

function ThemeControl() {
  const [theme, setTheme] = useState<'light' | 'dark'>(currentTheme)
  useEffect(() => {
    const saved = localStorage.getItem('feedbax-theme')
    const next =
      saved === 'dark' ||
      (!saved && matchMedia('(prefers-color-scheme: dark)').matches)
        ? 'dark'
        : 'light'
    setTheme(next)
    document.documentElement.dataset.theme = next
  }, [])
  const toggle = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    document.documentElement.dataset.theme = next
    localStorage.setItem('feedbax-theme', next)
  }
  return (
    <button
      className="icon-button"
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
      title={`Use ${theme === 'light' ? 'dark' : 'light'} theme`}
    >
      <Icon name={theme === 'light' ? 'moon' : 'sun'} />
    </button>
  )
}

function activeHref(href: string, activePage: PortalPage) {
  if (!href.startsWith('/')) return false
  if (activePage === 'feedback') return href === '/'
  return href === `/${activePage}` || href.startsWith(`/${activePage}/`)
}

const themeStyle = {
  '--brand-accent': portalBranding.accentColor,
  '--accent-foreground': portalBranding.accentForeground,
  '--light-accent-text': portalBranding.accentText.light,
  '--dark-accent-text': portalBranding.accentText.dark,
  '--light-background': portalBranding.themes.light.background,
  '--light-surface': portalBranding.themes.light.surface,
  '--light-text': portalBranding.themes.light.text,
  '--light-muted': portalBranding.themes.light.mutedText,
  '--light-line': portalBranding.themes.light.border,
  '--dark-background': portalBranding.themes.dark.background,
  '--dark-surface': portalBranding.themes.dark.surface,
  '--dark-text': portalBranding.themes.dark.text,
  '--dark-muted': portalBranding.themes.dark.mutedText,
  '--dark-line': portalBranding.themes.dark.border,
} as CSSProperties

export function PortalShell({
  activePage,
  wide = false,
  children,
}: PropsWithChildren<{ activePage: PortalPage; wide?: boolean }>) {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div className="portal" data-wide={wide || undefined} style={themeStyle}>
      <a className="skip-link" href="#main-content">
        Skip to Content
      </a>
      <header className="site-header">
        <div className="header-inner">
          <a
            className="brand"
            href="/"
            aria-label={`${portalBranding.productName} home`}
            translate="no"
          >
            <img
              src={portalBranding.logo}
              alt=""
              width="32"
              height="32"
              fetchPriority="high"
            />
            <span>{portalBranding.productName}</span>
          </a>
          <nav className="desktop-nav" aria-label="Primary navigation">
            {portalBranding.navigation.map((item) => (
              <a
                key={item.href}
                href={item.href}
                aria-current={
                  activeHref(item.href, activePage) ? 'page' : undefined
                }
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="header-actions">
            <ThemeControl />
            <button
              className="icon-button mobile-menu-button"
              type="button"
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
            >
              <Icon name={menuOpen ? 'close' : 'menu'} />
            </button>
          </div>
        </div>
        <nav
          id="mobile-navigation"
          className="mobile-nav"
          data-open={menuOpen || undefined}
          aria-label="Mobile navigation"
        >
          {portalBranding.navigation.map((item) => (
            <a
              key={item.href}
              href={item.href}
              aria-current={
                activeHref(item.href, activePage) ? 'page' : undefined
              }
              onClick={() => setMenuOpen(false)}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <footer>
        {portalBranding.poweredByFeedbax ? (
          <a href="https://github.com/jessequartey/feedbax" rel="noreferrer">
            Powered by Feedbax
          </a>
        ) : (
          <span />
        )}
        {portalBranding.supportUrl ? (
          <a href={portalBranding.supportUrl}>Get Support</a>
        ) : null}
      </footer>
    </div>
  )
}

export function PortalLoading({
  activePage = 'feedback',
  wide = false,
}: { activePage?: PortalPage; wide?: boolean } = {}) {
  return (
    <PortalShell activePage={activePage} wide={wide}>
      <ApplicationState kind="loading" title="Getting the latest updates…">
        <p>This should only take a moment.</p>
      </ApplicationState>
    </PortalShell>
  )
}

export function ConnectorOutage({
  onRetry,
  activePage = 'feedback',
  wide = false,
}: {
  onRetry: () => void
  activePage?: PortalPage
  wide?: boolean
}) {
  const subject =
    activePage === 'roadmap'
      ? 'The roadmap'
      : activePage === 'changelog'
        ? 'The changelog'
        : 'Feedback'
  const actions = (
    <>
      <button className="primary-button" type="button" onClick={onRetry}>
        Try Again
      </button>
      {portalBranding.supportUrl ? (
        <a href={portalBranding.supportUrl}>Contact Support</a>
      ) : null}
    </>
  )
  return (
    <PortalShell activePage={activePage} wide={wide}>
      <ApplicationState
        kind="connector"
        title={`${subject} is temporarily unavailable`}
        actions={actions}
      >
        <p>
          We couldn’t reach the connected workspace. Your account and existing
          feedback are safe.
        </p>
      </ApplicationState>
    </PortalShell>
  )
}
