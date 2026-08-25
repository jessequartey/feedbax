import type { PublicPost, PublicPostRoadmap } from "@feedbax/feedback";
import { Skeleton } from "@feedbax/ui/components/skeleton";
import type { ReactNode } from "react";
import { Filter } from "lucide-react";
import { Button } from "@feedbax/ui/components/button";
import { Badge } from "@feedbax/ui/components/badge";
import { Card } from "@feedbax/ui/components/card";
import { ButtonGroup } from "@feedbax/ui/components/button-group";
import { Tabs, TabsList, TabsTrigger } from "@feedbax/ui/components/tabs";

import { formatPublicDate } from "./public-date";
import { PostLink } from "./masked-post-link";
import { CommandPaletteTrigger } from "./components/command-palette";

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
    <main className="mx-auto w-full max-w-[96rem] px-6 py-10 lg:px-10">
      <RoadmapIntro />

      <ButtonGroup className="mt-8 grid w-full grid-cols-[1fr_auto] sm:ml-auto sm:flex sm:w-fit lg:-mt-12">
        <CommandPaletteTrigger className="justify-start" />
        <Button
          className="h-10 gap-2 px-4 text-sm"
          variant="outline"
          type="button"
        >
          <Filter />
          Filters
        </Button>
        <Button
          className="col-span-2 h-10 px-5 text-sm"
          render={<a href="/submit" />}
        >
          New post
        </Button>
      </ButtonGroup>

      <Tabs
        className="mt-6 lg:hidden"
        defaultValue="Planned"
        aria-hidden="true"
      >
        <TabsList className="grid h-12 w-full grid-cols-3" variant="line">
          {roadmapGroups.map(({ status, heading }) => (
            <TabsTrigger key={status} value={status} data-status={status}>
              {heading}{" "}
              <strong className="ml-2 font-medium">
                {roadmap[status].length}
              </strong>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div
        className="mt-8 grid gap-5 lg:grid-cols-3"
        aria-label="Product roadmap"
      >
        {roadmapGroups.map(({ status, heading, headingId }) => (
          <RoadmapColumn
            count={<span>{roadmap[status].length}</span>}
            heading={heading}
            headingId={headingId}
            key={status}
          >
            {roadmap[status].length === 0 ? (
              <p className="border border-dashed p-8 text-center text-sm text-muted-foreground">
                No Posts here yet.
              </p>
            ) : (
              <ol className="grid gap-3">
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
    <Card
      className="gap-0 p-4"
      aria-labelledby={headingId}
      {...(skeleton ? { "data-roadmap-skeleton-column": "" } : {})}
    >
      <header className="flex items-center justify-between px-1 pb-4">
        <h2
          className="flex items-center gap-2 text-sm font-medium"
          id={headingId}
        >
          <span
            className={`size-2.5 rounded-full ${heading === "Planned" ? "bg-violet-500" : heading === "Shipped" ? "bg-green-500" : "bg-blue-500"}`}
          />
          {heading}
        </h2>
        {count}
      </header>
      {children}
    </Card>
  );
}

function RoadmapIntro() {
  return (
    <section aria-labelledby="roadmap-heading">
      <h1
        className="text-3xl font-semibold tracking-tight"
        id="roadmap-heading"
      >
        Roadmap
      </h1>
      <p className="mt-2 text-base text-muted-foreground">
        What we’re planning, building, and shipping.
      </p>
    </section>
  );
}

function RoadmapItem({ item, masked }: { item: PublicPost; masked: boolean }) {
  return (
    <li>
      <PostLink
        slug={item.slug}
        contextual={masked}
        className="block border p-5 transition-colors hover:bg-muted/30"
      >
        <article>
          <h3 className="text-base font-medium">{item.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {item.description}
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <Badge variant="outline">{item.type}</Badge>
            <time dateTime={item.updatedAt.toISOString()}>
              Updated {formatPublicDate(item.updatedAt)}
            </time>
          </div>
        </article>
      </PostLink>
    </li>
  );
}
