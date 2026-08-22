import type { PublicPost, PublicPostRoadmap } from "@feedbax/feedback";
import { Skeleton } from "@feedbax/ui/components/skeleton";
import type { ReactNode } from "react";

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
          <RoadmapColumn
            count={<span>{roadmap[status].length}</span>}
            heading={heading}
            headingId={headingId}
            key={status}
          >
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
          </RoadmapColumn>
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
        {roadmapGroups.map(({ status, heading, headingId }) => (
          <RoadmapColumn
            count={<Skeleton className="roadmap-skeleton-count" />}
            heading={heading}
            headingId={headingId}
            key={status}
            skeleton
          >
            <div className="roadmap-skeleton-card">
              <Skeleton className="roadmap-skeleton-meta" />
              <Skeleton className="roadmap-skeleton-title" />
              <Skeleton className="roadmap-skeleton-copy" />
              <Skeleton className="roadmap-skeleton-copy roadmap-skeleton-copy-short" />
            </div>
          </RoadmapColumn>
        ))}
      </div>
      <span className="sr-only">Loading roadmap Posts…</span>
    </main>
  );
}

function RoadmapColumn({
  children,
  count,
  heading,
  headingId,
  skeleton = false,
}: {
  children: ReactNode;
  count: ReactNode;
  heading: string;
  headingId: string;
  skeleton?: boolean;
}) {
  return (
    <section
      className="roadmap-group"
      aria-labelledby={headingId}
      {...(skeleton ? { "data-roadmap-skeleton-column": "" } : {})}
    >
      <header>
        <h2 id={headingId}>{heading}</h2>
        {count}
      </header>
      {children}
    </section>
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
