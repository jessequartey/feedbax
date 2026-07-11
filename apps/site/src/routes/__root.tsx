import { createRootRoute, HeadContent, Link, Outlet, Scripts } from '@tanstack/react-router'
import { RootProvider } from 'fumadocs-ui/provider/tanstack'
import { SiteHeader } from '../components/site-header'
import { canonicalBaseUrl } from '../lib/site'
import siteCss from '../styles.css?url'

const description = 'Open-source customer feedback for teams that want to keep Notion as their operational backend.'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Feedbax — own your feedback' },
      { name: 'description', content: description },
      { property: 'og:title', content: 'Feedbax — own your feedback' },
      { property: 'og:description', content: description },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'theme-color', content: '#f75d3f' },
    ],
    links: [
      { rel: 'stylesheet', href: siteCss },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      ...(canonicalBaseUrl ? [{ rel: 'canonical', href: canonicalBaseUrl }] : []),
    ],
  }),
  component: RootDocument,
  notFoundComponent: () => <main className="not-found"><p className="eyebrow">404 / misplaced signal</p><h1>This page is not on the board.</h1><p>Try the documentation or head back to the beginning.</p><div className="button-row"><Link className="button primary" to="/docs/$" params={{ _splat: '' }}>Read the docs</Link><Link className="button secondary" to="/">Back home</Link></div></main>,
})

function RootDocument() {
  return <html lang="en" suppressHydrationWarning><head><HeadContent /></head><body><RootProvider search={{ enabled: false }} theme={{ attribute: 'class', defaultTheme: 'system', enableSystem: true, storageKey: 'feedbax-theme' }}><SiteHeader /><Outlet /></RootProvider><Scripts /></body></html>
}
