import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router'
import { ApplicationState } from '../components/application-state.js'
import { PortalShell } from '../components/portal-shell.js'
import { portalBranding, portalPublicConfig } from '../portal.config.js'
import portalCss from '../styles.css?url'
import { useEffect } from 'react'

const themeScript = `(function(){try{var saved=localStorage.getItem('feedbax-theme');var theme=saved==='light'||saved==='dark'?saved:(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.dataset.theme=theme}catch(_){document.documentElement.dataset.theme='light'}})()`

export function rootMetadata() {
  const title = `${portalBranding.productName} Feedback`
  const image = portalBranding.socialPreviewImage
  return {
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title },
      { name: 'description', content: portalBranding.description },
      { property: 'og:title', content: title },
      { property: 'og:description', content: portalBranding.description },
      { property: 'og:type', content: 'website' },
      ...(image ? [{ property: 'og:image', content: image }] : []),
      {
        name: 'twitter:card',
        content: image ? 'summary_large_image' : 'summary',
      },
      ...(image ? [{ name: 'twitter:image', content: image }] : []),
      {
        name: 'theme-color',
        content: portalBranding.themes.light.background,
        media: '(prefers-color-scheme: light)',
      },
      {
        name: 'theme-color',
        content: portalBranding.themes.dark.background,
        media: '(prefers-color-scheme: dark)',
      },
    ],
    links: [
      { rel: 'stylesheet', href: portalCss },
      { rel: 'icon', href: portalBranding.favicon },
      { rel: 'canonical', href: portalPublicConfig.publicUrl },
    ],
  }
}

export const Route = createRootRoute({
  head: rootMetadata,
  notFoundComponent: () => (
    <PortalShell activePage="feedback">
      <ApplicationState
        kind="not-found"
        title="This page isn’t available"
        actions={
          <a className="primary-button" href="/">
            Browse Feedback
          </a>
        }
      >
        <p>The address may be incorrect, or the page may have moved.</p>
      </ApplicationState>
    </PortalShell>
  ),
  component: RootDocument,
})

function RootDocument() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <HeadContent />
      </head>
      <body>
        <HydrationMarker />
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}

function HydrationMarker() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = 'true'
  }, [])
  return null
}
