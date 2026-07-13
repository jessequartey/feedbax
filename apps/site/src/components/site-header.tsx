import { Link } from '@tanstack/react-router'
import { Code2, Menu, Moon, Search, Sun, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTheme } from 'fumadocs-ui/provider/base'
import {
  docsNavigation,
  feedbackPortalUrl,
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
  const dialogRef = useRef<HTMLDialogElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
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
        setOpen((current) => {
          if (!current)
            openerRef.current = document.activeElement as HTMLElement | null
          return !current
        })
      }
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [])

  useEffect(() => {
    if (open && !dialogRef.current?.open) {
      dialogRef.current?.showModal()
      window.setTimeout(() => inputRef.current?.focus(), 0)
    } else if (!open && dialogRef.current?.open) {
      dialogRef.current.close()
      window.setTimeout(() => openerRef.current?.focus(), 0)
    }
  }, [open])

  return (
    <>
      <button
        className={compact ? 'icon-button' : 'search-trigger'}
        type="button"
        onClick={(event) => {
          openerRef.current = event.currentTarget
          setOpen(true)
        }}
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
      <dialog
        ref={dialogRef}
        className="search-dialog"
        aria-labelledby="docs-search-title"
        onCancel={(event) => {
          event.preventDefault()
          setOpen(false)
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false)
        }}
      >
        <h2 className="sr-only" id="docs-search-title">
          Search Documentation
        </h2>
        <div className="search-input-wrap">
          <Search aria-hidden="true" />
          <input
            ref={inputRef}
            name="docs-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the docs…"
            aria-label="Search query"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close search"
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <div className="search-results" aria-label="Search results">
          <p className="sr-only" role="status" aria-live="polite">
            {results.length} {results.length === 1 ? 'result' : 'results'}{' '}
            available
          </p>
          {results.map((item) => (
            <Link
              key={item.href}
              to="/docs/$"
              params={{ _splat: item.slug }}
              onClick={() => setOpen(false)}
            >
              <strong>{item.title}</strong>
              <span>{item.description}</span>
            </Link>
          ))}
          {results.length === 0 && <p>No documentation matches your search.</p>}
        </div>
      </dialog>
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
          <a href={feedbackPortalUrl} target="_blank" rel="noreferrer">
            Feedback
          </a>
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
            aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
            aria-expanded={menuOpen}
            aria-controls="site-mobile-navigation"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </button>
        </div>
      </div>
      {menuOpen && (
        <nav
          id="site-mobile-navigation"
          className="mobile-nav"
          aria-label="Mobile navigation"
        >
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
          <a href={feedbackPortalUrl} target="_blank" rel="noreferrer">
            Feedback
          </a>
        </nav>
      )}
    </header>
  )
}
