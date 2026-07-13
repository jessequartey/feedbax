import { createFileRoute } from '@tanstack/react-router'
import { RoadmapBoard } from '../components/roadmap-board.js'
import {
  ConnectorOutage,
  PortalLoading,
  PortalShell,
} from '../components/portal-shell.js'
import { portalBranding, publicRoadmap } from '../portal.config.js'
import { getServerStatus } from '../server.functions.js'

export const Route = createFileRoute('/roadmap')({
  loader: () => getServerStatus(),
  head: () => ({
    meta: [
      { title: `${publicRoadmap.title} · ${portalBranding.name}` },
      { name: 'description', content: publicRoadmap.description },
    ],
  }),
  pendingComponent: () => <PortalLoading activePage="roadmap" wide />,
  errorComponent: ({ reset }) => (
    <ConnectorOutage onRetry={reset} activePage="roadmap" wide />
  ),
  component: RoadmapPage,
})

function RoadmapPage() {
  Route.useLoaderData()
  return (
    <PortalShell branding={portalBranding} activePage="roadmap" wide>
      <RoadmapBoard />
    </PortalShell>
  )
}
