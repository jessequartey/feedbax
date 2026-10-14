import { Button } from "@feedbax/ui/components/button";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowRight,
  Braces,
  Cloud,
  CodeXml,
  Database,
  ShieldCheck,
} from "lucide-react";

import { SiteHeader } from "../components/site-header";

export const Route = createFileRoute("/")({
  head: () => ({ links: [{ rel: "canonical", href: "https://feedbax.dev" }] }),
  component: HomePage,
});

function HomePage() {
  return (
    <div className="marketing-shell">
      <SiteHeader />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">Open-source feedback management</p>
            <h1>
              Feedback in Notion.
              <br />
              On your terms.
            </h1>
            <p className="hero-lede">
              Give Participants a thoughtful public portal while your Product
              Team keeps planning and triage where it already works.
            </p>
            <div className="hero-actions">
              <Button
                nativeButton={false}
                size="lg"
                render={<a href="/docs/getting-started" />}
              >
                Deploy Feedbax <ArrowRight />
              </Button>
              <Button
                nativeButton={false}
                size="lg"
                variant="outline"
                render={<a href="https://feedback.feedbax.dev" />}
              >
                Explore the portal
              </Button>
            </div>
          </div>
          <div
            className="hero-visual"
            aria-label="Feedbax feedback portal preview"
          >
            <div className="portal-preview">
              <div className="preview-bar">
                <span className="preview-logo">F</span>
                <span>Feedback</span>
                <span>Roadmap</span>
                <span>Changelog</span>
              </div>
              <div className="preview-grid">
                <div className="preview-feed">
                  <p className="preview-kicker">FEEDBACK</p>
                  <h2>What should we build next?</h2>
                  {[
                    ["Notion-backed roadmap", "Shipped", "12"],
                    ["Native comment threads", "In progress", "8"],
                    ["Custom feedback boards", "Planned", "5"],
                  ].map(([title, status, votes]) => (
                    <div className="preview-row" key={title}>
                      <b>{votes}</b>
                      <span>
                        <strong>{title}</strong>
                        <small>{status}</small>
                      </span>
                    </div>
                  ))}
                </div>
                <aside>
                  <span>ALL POSTS</span>
                  <span>FEATURE REQUESTS</span>
                  <span>BUG REPORTS</span>
                </aside>
              </div>
            </div>
          </div>
        </section>

        <section className="workflow section-pad">
          <p className="eyebrow">One workflow, two surfaces</p>
          <h2>
            A public portal outside.
            <br />
            Your Notion workflow inside.
          </h2>
          <div
            className="flow-line"
            aria-label="Participant to Feedbax to Notion workflow"
          >
            <span>Participant</span>
            <ArrowRight />
            <span>Feedbax portal</span>
            <ArrowRight />
            <span>Notion Workspace</span>
          </div>
        </section>

        <section className="proof section-pad">
          <div>
            <Database />
            <p className="eyebrow">Notion-native</p>
            <h3>Posts, roadmap, and changelog stay with your Product Team.</h3>
          </div>
          <div>
            <Cloud />
            <p className="eyebrow">Self-hosted</p>
            <h3>Deploy a complete TanStack application to Cloudflare.</h3>
          </div>
          <div>
            <Braces />
            <p className="eyebrow">Programmable</p>
            <h3>
              Accept trusted feedback from your product through one endpoint.
            </h3>
          </div>
        </section>

        <section className="integration section-pad">
          <div>
            <p className="eyebrow">Bring your own surface</p>
            <h2>Feedback belongs in the product.</h2>
            <p>
              Use the copied-source feedback block or submit through the trusted
              server endpoint.
            </p>
            <a className="text-link" href="/docs/integrations/submission-api">
              Read the integration guide <ArrowRight />
            </a>
          </div>
          <pre aria-label="Trusted submission example">
            <code>{`await fetch("https://feedback.feedbax.dev/api/v1/posts", {\n  method: "POST",\n  headers: {\n    Authorization: \`Bearer \${FEEDBAX_API_SECRET}\`,\n    "Idempotency-Key": eventId,\n  },\n  body: JSON.stringify(feedback),\n});`}</code>
          </pre>
        </section>

        <section className="trust section-pad">
          <ShieldCheck />
          <div>
            <p className="eyebrow">Clear guarantees</p>
            <h2>Honest about identity.</h2>
            <p>
              The Notion-only Profile offers best-effort Votes and unverified
              Comments. It does not pretend browser memory is an account or a
              one-person-one-vote system.
            </p>
            <a className="text-link" href="/docs/reference/guarantees">
              Understand the guarantees <ArrowRight />
            </a>
          </div>
        </section>

        <section className="final-cta section-pad">
          <p className="eyebrow">Own the whole thing</p>
          <h2>Start with one command.</h2>
          <code>npx create-feedbax</code>
          <div className="hero-actions">
            <Button
              nativeButton={false}
              size="lg"
              render={<a href="/docs/getting-started" />}
            >
              Open the quickstart <ArrowRight />
            </Button>
            <Button
              nativeButton={false}
              size="lg"
              variant="ghost"
              render={<a href="https://github.com/jessequartey/feedbax" />}
            >
              <CodeXml /> View source
            </Button>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <span>Feedbax Core · Apache-2.0</span>
        <nav>
          <a href="https://github.com/jessequartey/feedbax/blob/main/CONTRIBUTING.md">
            Contributing
          </a>
          <a href="https://github.com/jessequartey/feedbax/blob/main/SECURITY.md">
            Security
          </a>
          <a href="https://github.com/jessequartey/feedbax/blob/main/LICENSE">
            License
          </a>
        </nav>
      </footer>
    </div>
  );
}
