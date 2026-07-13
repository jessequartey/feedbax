import { createFileRoute } from '@tanstack/react-router'
import { ChangelogFeed } from '../components/changelog-feed.js'
import { ConnectorOutage, PortalLoading, PortalShell } from '../components/portal-shell.js'
import { portalBranding, publicChangelog } from '../portal.config.js'
import { getServerStatus } from '../server.functions.js'

export const Route = createFileRoute('/changelog')({
  loader: () => getServerStatus(),
  head: () => ({
    meta: [
      { title: `${publicChangelog.title} · ${portalBranding.name}` },
      { name: 'description', content: publicChangelog.description },
    ],
  }),
  pendingComponent: () => <PortalLoading activePage="changelog" />,
  errorComponent: ({ reset }) => <ConnectorOutage onRetry={reset} activePage="changelog" />,
  component: ChangelogPage,
})

function ChangelogPage() {
  Route.useLoaderData()
  return (
    <PortalShell branding={portalBranding} activePage="changelog">
      <ChangelogFeed />
    </PortalShell>
  )
}
