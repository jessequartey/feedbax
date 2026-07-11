import { AppShell } from '@feedbax/ui'
import { createFileRoute } from '@tanstack/react-router'
import { getServerStatus } from '../server.functions.js'

export const Route = createFileRoute('/')({ loader: () => getServerStatus(), component: Portal })

function Portal() {
  const status = Route.useLoaderData()
  return <AppShell title="Feedbax runtime spike" description="TanStack Start portability verification.">
    <main data-spike="ssr">
      <p>This page was server rendered.</p>
      <dl><dt>Server function</dt><dd>{status.primitive}</dd><dt>Environment marker</dt><dd>{status.environment.marker}</dd><dt>Notion configured</dt><dd>{String(status.environment.notionConfigured)}</dd></dl>
      <nav aria-label="Spike endpoints"><a href="/api/cache">Cacheable response</a> · <a href="/api/notion">Notion check</a> · <a href="/api/error?kind=expected">Expected error</a></nav>
    </main>
  </AppShell>
}
