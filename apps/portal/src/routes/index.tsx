import { createFileRoute } from '@tanstack/react-router'
import { getServerStatus } from '../server.functions.js'
import {
  ConnectorOutage,
  PortalLoading,
  PortalShell,
} from '../components/portal-shell.js'
import { FeedbackBoard } from '../components/feedback-board.js'
import { portalBranding } from '../portal.config.js'

export const Route = createFileRoute('/')({
  loader: () => getServerStatus(),
  pendingComponent: PortalLoading,
  errorComponent: ({ reset }) => <ConnectorOutage onRetry={reset} />,
  component: Portal,
})

function Portal() {
  Route.useLoaderData()
  return (
    <PortalShell branding={portalBranding} activePage="feedback">
      <FeedbackBoard />
    </PortalShell>
  )
}
