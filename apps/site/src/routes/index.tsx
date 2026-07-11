import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight, Check, CircleDashed, Code2 } from 'lucide-react'
import { githubUrl } from '../lib/site'

export const homepageClaims = {
  promise: 'Turn your Notion database into a customer feedback portal.',
  status: 'Feedbax is an early, pre-release project. The foundation exists; the complete feedback loop is planned for v0.0.2.',
} as const

export const Route = createFileRoute('/')({
  head: () => ({ meta: [{ title: 'Feedbax — customer feedback, without another backend' }] }),
  component: HomePage,
})

function HomePage() {
  return <main className="home">
    <section className="hero">
      <div className="hero-grid" aria-hidden="true" />
      <div className="hero-content">
        <p className="eyebrow hero-reveal">Open source · pre-release</p>
        <h1 className="hero-reveal">Turn your Notion database into a <em>customer feedback portal.</em></h1>
        <p className="hero-copy hero-reveal">Own the customer experience. Keep the workflow your team already knows.</p>
        <div className="button-row hero-reveal">
          <Link className="button primary" to="/docs/$" params={{ _splat: '' }}>Read the docs <ArrowRight aria-hidden="true" /></Link>
          <a className="button secondary" href={githubUrl} target="_blank" rel="noreferrer"><Code2 aria-hidden="true" /> View on GitHub</a>
        </div>
      </div>
      <div className="hero-note hero-reveal"><span>Built for technical founders</span><span>Notion first</span><span>Self-hosted</span></div>
    </section>

    <section className="workflow section-shell">
      <div className="section-heading"><p className="eyebrow">One clean handoff</p><h2>Your workflow stays put.</h2><p>Feedbax owns the public experience while your tools remain the source of truth.</p></div>
      <div className="workflow-line">
        <div><span>01</span><strong>Your application</strong><p>Issues a short-lived identity handoff.</p></div>
        <ArrowRight aria-hidden="true" />
        <div className="workflow-focus"><span>02</span><strong>Feedbax</strong><p>Presents feedback, roadmap, and changelog.</p></div>
        <ArrowRight aria-hidden="true" />
        <div><span>03</span><strong>Notion</strong><p>Remains your team’s operational backend.</p></div>
      </div>
    </section>

    <section className="manifesto section-shell">
      <p className="eyebrow">The thesis</p>
      <blockquote>Customer feedback should be a product surface—not another product-management subscription.</blockquote>
      <div className="manifesto-detail"><p>Public browsing stays open. Identity is required only for actions. Connectors declare what they can actually do.</p><Link to="/docs/$" params={{ _splat: 'product-vision' }}>Read the product vision <ArrowRight aria-hidden="true" /></Link></div>
    </section>

    <section className="status-section section-shell">
      <div className="section-heading"><p className="eyebrow">Build in public, claim carefully</p><h2>Early, with the edges visible.</h2><p>{homepageClaims.status}</p></div>
      <div className="status-list">
        <div><Check aria-hidden="true" /><span><strong>Foundation available</strong><small>Monorepo boundaries, typed interfaces, runtime spike, and deployment evidence.</small></span></div>
        <div><CircleDashed aria-hidden="true" /><span><strong>v0.0.2 in progress</strong><small>Feedback, voting, comments, schema mapping, sessions, roadmap, and changelog.</small></span></div>
        <div><CircleDashed aria-hidden="true" /><span><strong>Deliberately deferred</strong><small>Other connectors, managed hosting, widgets, and full synchronization.</small></span></div>
      </div>
    </section>

    <section className="final-cta">
      <div><p className="eyebrow">Follow the build</p><h2>Bring the backend you already have.</h2></div>
      <div><p>Start with the architecture, inspect the roadmap, or tell us how your team handles feedback today.</p><div className="button-row"><Link className="button primary" to="/docs/$" params={{ _splat: '' }}>Read the docs <ArrowRight /></Link><a className="text-link" href={`${githubUrl}/issues`} target="_blank" rel="noreferrer">Share your workflow</a></div></div>
    </section>
    <footer className="site-footer"><span>Feedbax · MIT licensed</span><span>Own your feedback. Keep your existing workflow.</span></footer>
  </main>
}
