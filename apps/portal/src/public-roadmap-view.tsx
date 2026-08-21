import type { PublicPost, PublicPostRoadmap } from "@feedbax/feedback";

import { postPath } from "./public-post-page";
import { formatPublicDate } from "./public-date";

const roadmapGroups = [
  { status: "Planned", heading: "Planned", headingId: "roadmap-planned" },
  {
    status: "In Progress",
    heading: "In progress",
    headingId: "roadmap-in-progress",
  },
  { status: "Shipped", heading: "Shipped", headingId: "roadmap-shipped" },
] as const;

export function PublicRoadmapView({ roadmap }: { roadmap: PublicPostRoadmap }) {
  return (
    <main className="roadmap-page">
      <section className="roadmap-intro" aria-labelledby="roadmap-heading">
        <p className="feedback-eyebrow">Public roadmap</p>
        <h1 id="roadmap-heading">See where feedback is heading.</h1>
        <p>
          Follow what the Product Team has planned, what is being built, and
          what has already shipped.
        </p>
      </section>

      <div className="roadmap-groups">
        {roadmapGroups.map(({ status, heading, headingId }) => (
          <section
            className="roadmap-group"
            aria-labelledby={headingId}
            key={status}
          >
            <header>
              <h2 id={headingId}>{heading}</h2>
              <span>{roadmap[status].length}</span>
            </header>
            {roadmap[status].length === 0 ? (
              <p className="roadmap-empty">No Posts here yet.</p>
            ) : (
              <ol className="roadmap-list">
                {roadmap[status].map((item) => (
                  <RoadmapItem item={item} key={item.slug} />
                ))}
              </ol>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}

function RoadmapItem({ item }: { item: PublicPost }) {
  return (
    <li>
      <a href={postPath(item)}>
        <article>
          <div className="roadmap-item-meta">
            <span>{item.type}</span>
            <time dateTime={item.updatedAt.toISOString()}>
              Updated {formatPublicDate(item.updatedAt)}
            </time>
          </div>
          <h3>{item.title}</h3>
          <p>{item.description}</p>
        </article>
      </a>
    </li>
  );
}
