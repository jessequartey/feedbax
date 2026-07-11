import { Link } from '@tanstack/react-router'
import { Code2, Menu, Moon, Search, Sun, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from 'fumadocs-ui/provider/base'
import {
  docsNavigation,
  githubUrl,
  matchesSearch,
  searchIndex,
} from '../lib/site'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const dark = resolvedTheme === 'dark'

  return (
    <button
      className="icon-button"
      type="button"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label={`Switch to ${dark ? 'light' : 'dark'} theme`}
    >
      {dark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </button>
  )
}

export function SearchDialog({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const results = useMemo(() => {
    const value = query.trim().toLowerCase()
    return value
      ? searchIndex.filter((item) => matchesSearch(item.keywords, value))
      : searchIndex.slice(0, 5)
  }, [query])

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((current) => !current)
      }
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])

  return (
    <>
      <button
        className={compact ? 'icon-button' : 'search-trigger'}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Search documentation"
      >
        <Search aria-hidden="true" />
        {!compact && (
          <>
            <span>Search docs</span>
            <kbd>⌘ K</kbd>
          </>
        )}
      </button>
      {open && (
        <div
          className="dialog-backdrop"
          role="presentation"
          onMouseDown={() => setOpen(false)}
        >
          <section
            className="search-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Search documentation"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="search-input-wrap">
              <Search aria-hidden="true" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search the docs…"
                aria-label="Search query"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close search"
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <div
              className="search-results"
              role="listbox"
              aria-label="Search results"
            >
              {results.map((item) => (
                <Link
                  key={item.href}
                  to="/docs/$"
                  params={{ _splat: item.slug }}
                  onClick={() => setOpen(false)}
                  role="option"
                >
                  <strong>{item.title}</strong>
                  <span>{item.description}</span>
                </Link>
              ))}
              {results.length === 0 && <p>No documentation found.</p>}
            </div>
          </section>
        </div>
      )}
    </>
  )
}

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link to="/" className="wordmark" aria-label="Feedbax home">
          <span className="brand-mark">f</span>feedbax
        </Link>
        <nav className="desktop-nav" aria-label="Main navigation">
          <Link to="/docs/$" params={{ _splat: '' }}>
            Docs
          </Link>
          <Link to="/docs/$" params={{ _splat: 'roadmap' }}>
            Roadmap
          </Link>
          <a href={githubUrl} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
        <div className="header-actions">
          <SearchDialog />
          <a
            className="icon-button desktop-github"
            href={githubUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="Feedbax on GitHub"
          >
            <Code2 aria-hidden="true" />
          </a>
          <ThemeToggle />
          <button
            className="icon-button mobile-menu-trigger"
            type="button"
            aria-label="Toggle navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X /> : <Menu />}
          </button>
        </div>
      </div>
      {menuOpen && (
        <nav className="mobile-nav" aria-label="Mobile navigation">
          <Link
            to="/docs/$"
            params={{ _splat: '' }}
            onClick={() => setMenuOpen(false)}
          >
            Documentation
          </Link>
          {docsNavigation.slice(1).map((item) => (
            <Link
              key={item.slug}
              to="/docs/$"
              params={{ _splat: item.slug }}
              onClick={() => setMenuOpen(false)}
            >
              {item.title}
            </Link>
          ))}
          <a href={githubUrl} target="_blank" rel="noreferrer">
            GitHub
          </a>
        </nav>
      )}
    </header>
  )
}
