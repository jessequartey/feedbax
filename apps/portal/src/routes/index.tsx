import { AppShell } from '@feedbax/ui'
import { createFileRoute } from '@tanstack/react-router'
import { getServerStatus } from '../server.functions.js'

export const Route = createFileRoute('/')({
  loader: () => getServerStatus(),
  component: Portal,
})

function Portal() {
  const status = Route.useLoaderData()
  return (
    <AppShell
      title="Feedbax runtime spike"
      description="TanStack Start portability verification."
    >
      <main data-spike="ssr">
        <p>This page was server rendered.</p>
        <dl>
          <dt>Server function</dt>
          <dd>{status.primitive}</dd>
          <dt>Environment marker</dt>
          <dd>{status.environment.marker}</dd>
        </dl>
        <nav aria-label="Spike endpoints">
          <a href="/api/cache">Cacheable response</a> ·{' '}
          <a href="/api/error?kind=expected">Expected error</a>
        </nav>
        <section className="identity-panel" aria-labelledby="identity-title">
          <h2 id="identity-title">Share feedback with verified identity</h2>
          <p>
            Anyone can browse this board. Verified identity is required only to
            submit feedback, vote, comment, or subscribe. This prevents
            duplicate votes and helps protect the community from abuse.
          </p>
          <form
            method="get"
            action="/"
            onSubmit={(event) => event.preventDefault()}
          >
            <label htmlFor="feedback-draft">Feedback draft</label>
            <textarea
              id="feedback-draft"
              name="draft"
              rows={4}
              placeholder="Your draft stays here while you sign in."
            />
            <button type="button" aria-describedby="identity-help">
              Sign in to submit
            </button>
            <small id="identity-help">
              After sign-in, you return here to review and confirm. Nothing is
              submitted automatically.
            </small>
          </form>
        </section>
      </main>
    </AppShell>
  )
}
