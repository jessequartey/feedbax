import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: Portal })
function Portal() {
  return (
    <main>
      <header>
        <strong>Feedbax</strong>
        <nav>
          <a href="/">Feedback</a>
          <a href="/roadmap">Roadmap</a>
          <a href="/changelog">Changelog</a>
        </nav>
      </header>
      <section>
        <p className="eyebrow">PUBLIC FEEDBACK</p>
        <h1>What should we build next?</h1>
        <p>
          Browse ideas, vote on priorities, and share feedback with the team.
        </p>
        <button type="button">Submit feedback</button>
      </section>
      <section aria-label="Feedback">
        <div className="toolbar">
          <input aria-label="Search feedback" placeholder="Search feedback" />
          <select aria-label="Status">
            <option>All statuses</option>
          </select>
        </div>
        <p className="empty">
          Connect Notion and run <code>feedbax doctor</code> to load your board.
        </p>
      </section>
    </main>
  )
}
