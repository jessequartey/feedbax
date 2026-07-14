import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Button, Input, StatusBadge } from '@feedbax/ui'
import './styles.css'
function Playground() {
  return (
    <main>
      <header>
        <p>FEEDBAX PLAYGROUND</p>
        <h1>Portal states</h1>
        <span>Fixture-backed visual review</span>
      </header>
      <section>
        <div className="toolbar">
          <Input aria-label="Search feedback" placeholder="Search feedback" />
          <Button>Submit feedback</Button>
        </div>
        <article>
          <div>
            <StatusBadge>Planned</StatusBadge>
            <h2>Make filtering shareable</h2>
            <p>Keep search, status, sort, and pagination in the URL.</p>
          </div>
          <strong>24 votes</strong>
        </article>
        <article className="degraded">
          <div>
            <StatusBadge>Connector unavailable</StatusBadge>
            <h2>Notion could not be reached</h2>
            <p>
              The portal distinguishes provider failure from an empty board.
            </p>
          </div>
          <Button variant="outline">Try again</Button>
        </article>
      </section>
    </main>
  )
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Playground />
  </StrictMode>,
)
