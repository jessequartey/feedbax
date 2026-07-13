import { describe, expect, it } from 'vitest'
import { notionConnector } from '@feedbax/notion'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { ApplicationState } from './components/application-state.js'
import { PortalShell } from './components/portal-shell.js'
import { rootMetadata } from './routes/__root.js'
import { portalBranding } from './portal.config.js'
describe('portal workspace integration', () => {
  it('resolves an internal connector package', () => {
    expect(notionConnector.displayName).toBe('Notion')
  })

  it('renders configured branding, navigation, and attribution', () => {
    const html = renderToStaticMarkup(
      createElement(
        PortalShell,
        { activePage: 'feedback' },
        createElement('p', null, 'Content'),
      ),
    )
    expect(html).toContain(portalBranding.productName)
    expect(html).toContain(portalBranding.logo)
    expect(html).toContain('Powered by Feedbax')
    for (const link of portalBranding.navigation)
      expect(html).toContain(link.href)
  })

  it('generates root metadata from the configured brand', () => {
    const metadata = rootMetadata()
    expect(metadata.meta).toContainEqual({
      name: 'description',
      content: portalBranding.description,
    })
    expect(metadata.links).toContainEqual({
      rel: 'icon',
      href: portalBranding.favicon,
    })
  })

  it('renders accessible state variants with recovery content', () => {
    const html = renderToStaticMarkup(
      createElement(ApplicationState, {
        kind: 'unexpected',
        title: 'Could not load',
        requestId: 'request-1',
        actions: createElement('button', null, 'Try Again'),
        children: createElement('p', null, 'Safe message.'),
      }),
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain('request-1')
    expect(html).toContain('Try Again')
  })
})
