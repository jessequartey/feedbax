import type { PublicPost, PublicPostRoadmap } from "@feedbax/feedback";
import { Skeleton } from "@feedbax/ui/components/skeleton";

import { formatPublicDate } from "./public-date";
import { PostLink } from "./masked-post-link";

const roadmapGroups = [
  { status: "Planned", heading: "Planned", headingId: "roadmap-planned" },
  {
    status: "In Progress",
    heading: "In progress",
    headingId: "roadmap-in-progress",
  },
  { status: "Shipped", heading: "Shipped", headingId: "roadmap-shipped" },
] as const;

export function PublicRoadmapView({
  roadmap,
  maskPostLinks = false,
}: {
  roadmap: PublicPostRoadmap;
  maskPostLinks?: boolean;
}) {
  return (
    <main className="roadmap-page">
      <RoadmapIntro />

      <div className="roadmap-groups" aria-label="Product roadmap">
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
                  <RoadmapItem
                    item={item}
                    key={item.slug}
                    masked={maskPostLinks}
                  />
                ))}
              </ol>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}

export function PublicRoadmapSkeleton() {
  return (
    <main
      className="roadmap-page"
      aria-label="Loading roadmap"
      aria-busy="true"
    >
      <RoadmapIntro />
      <div className="roadmap-groups roadmap-skeleton-groups">
        {roadmapGroups.map(({ status, heading }) => (
          <section
            className="roadmap-group"
            data-roadmap-skeleton-column=""
            key={status}
          >
            <header>
              <h2>{heading}</h2>
              <Skeleton className="roadmap-skeleton-count" />
            </header>
            <div className="roadmap-skeleton-card">
              <Skeleton className="roadmap-skeleton-meta" />
              <Skeleton className="roadmap-skeleton-title" />
              <Skeleton className="roadmap-skeleton-copy" />
              <Skeleton className="roadmap-skeleton-copy roadmap-skeleton-copy-short" />
            </div>
          </section>
        ))}
      </div>
      <span className="sr-only">Loading roadmap Posts…</span>
    </main>
  );
}

function RoadmapIntro() {
  return (
    <section className="roadmap-intro" aria-labelledby="roadmap-heading">
      <p className="feedback-eyebrow">Public roadmap</p>
      <h1 id="roadmap-heading">See where feedback is heading.</h1>
      <p>
        Follow what the Product Team has planned, what is being built, and what
        has already shipped.
      </p>
    </section>
  );
}

function RoadmapItem({ item, masked }: { item: PublicPost; masked: boolean }) {
  return (
    <li>
      <PostLink slug={item.slug} contextual={masked}>
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
      </PostLink>
    </li>
  );
}
