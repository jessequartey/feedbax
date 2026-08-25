import type {
  PublicPost,
  PublicPostRoadmap,
  PublicRoadmapPage,
  PublicRoadmapQuery,
  RoadmapStatus,
} from "@feedbax/feedback";
import { Button } from "@feedbax/ui/components/button";
import { ButtonGroup } from "@feedbax/ui/components/button-group";
import { Card } from "@feedbax/ui/components/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@feedbax/ui/components/empty";
import { Skeleton } from "@feedbax/ui/components/skeleton";
import { Spinner } from "@feedbax/ui/components/spinner";
import { Tabs, TabsList, TabsTrigger } from "@feedbax/ui/components/tabs";
import { ArrowUp, CircleDashed, MessageCircle } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { CommandPaletteTrigger } from "./components/command-palette";
import { CreatePostTrigger } from "./components/create-post-trigger";
import { PostLink } from "./masked-post-link";
import { PostTypeBadge } from "./post-badges";
import type { FetchPublicRoadmapStatusPage } from "./roadmap-query";
import { useMediaQuery } from "./use-media-query";

const roadmapGroups = [
  {
    status: "Planned",
    heading: "Planned",
    headingId: "roadmap-planned",
    dot: "bg-status-planned",
  },
  {
    status: "In Progress",
    heading: "In progress",
    headingId: "roadmap-in-progress",
    dot: "bg-status-in-progress",
  },
  {
    status: "Shipped",
    heading: "Shipped",
    headingId: "roadmap-shipped",
    dot: "bg-status-shipped",
  },
] as const;

const mobileMediaQuery = "(max-width: 1023px)";

export function PublicRoadmapView({
  roadmap,
  loadMore,
  maskPostLinks = false,
}: {
  roadmap: PublicPostRoadmap;
  loadMore?: FetchPublicRoadmapStatusPage;
  maskPostLinks?: boolean;
}) {
  const mobile = useMediaQuery(mobileMediaQuery);
  const [activeStatus, setActiveStatus] = useState<RoadmapStatus>("Planned");
  const [columns, setColumns] = useState(roadmap);
  const [loading, setLoading] = useState<Partial<Record<RoadmapStatus, true>>>(
    {},
  );
  const [errors, setErrors] = useState<Partial<Record<RoadmapStatus, true>>>(
    {},
  );
  const [loadStatusMessage, setLoadStatusMessage] = useState("");

  useEffect(() => setColumns(roadmap), [roadmap]);

  const visibleGroups = mobile
    ? roadmapGroups.filter(({ status }) => status === activeStatus)
    : roadmapGroups;

  async function loadNextPage(query: PublicRoadmapQuery) {
    if (!loadMore || loading[query.status]) return;
    const group = roadmapGroups.find(({ status }) => status === query.status);
    if (!group) return;
    setLoadStatusMessage(`Loading more ${group.heading} Posts.`);
    setLoading((current) => ({ ...current, [query.status]: true }));
    setErrors((current) => {
      const next = { ...current };
      delete next[query.status];
      return next;
    });
    try {
      const nextPage = await loadMore(query);
      setColumns((current) => ({
        ...current,
        [query.status]: appendRoadmapPage(current[query.status], nextPage),
      }));
      setLoadStatusMessage(
        `${nextPage.items.length} more ${group.heading} ${nextPage.items.length === 1 ? "Post" : "Posts"} loaded.`,
      );
    } catch {
      setErrors((current) => ({ ...current, [query.status]: true }));
      setLoadStatusMessage(`Couldn’t load more ${group.heading} Posts.`);
    } finally {
      setLoading((current) => {
        const next = { ...current };
        delete next[query.status];
        return next;
      });
    }
  }

  return (
    <main className="mx-auto w-full max-w-[96rem] px-6 py-10 lg:px-10">
      <RoadmapIntro />

      <ButtonGroup className="mt-8 grid w-full grid-cols-[1fr_auto] sm:ml-auto sm:flex sm:w-fit lg:-mt-12">
        <CommandPaletteTrigger className="h-11 justify-start lg:h-10" />
        <CreatePostTrigger
          className="h-11 px-5 text-sm lg:h-10"
          contextual={maskPostLinks}
        />
      </ButtonGroup>

      {mobile ? (
        <Tabs
          className="mt-6"
          value={activeStatus}
          onValueChange={(value) => {
            if (isRoadmapStatus(value)) setActiveStatus(value);
          }}
        >
          <TabsList className="grid h-12 w-full grid-cols-3" variant="line">
            {roadmapGroups.map(({ status, heading }) => (
              <TabsTrigger key={status} value={status} data-status={status}>
                {heading}{" "}
                <strong className="ml-2 font-medium">
                  {columns[status].totalCount}
                </strong>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      ) : null}

      <p aria-label="Roadmap status" className="sr-only" role="status">
        {loadStatusMessage}
      </p>

      <div
        className={`mt-8 grid gap-5 ${mobile ? "grid-cols-1" : "lg:grid-cols-3"}`}
        aria-label="Product roadmap"
      >
        {visibleGroups.map(({ status, heading, headingId, dot }) => {
          const column = columns[status];
          return (
            <RoadmapColumn
              count={
                <span data-roadmap-count className="text-muted-foreground">
                  {column.totalCount}
                </span>
              }
              dot={dot}
              heading={heading}
              headingId={headingId}
              key={status}
            >
              {column.items.length === 0 ? (
                <RoadmapEmptyState heading={heading} />
              ) : (
                <ol className="grid gap-3">
                  {column.items.map((item) => (
                    <RoadmapItem
                      item={item}
                      key={item.slug}
                      masked={maskPostLinks}
                    />
                  ))}
                </ol>
              )}
              {errors[status] ? (
                <div
                  role="alert"
                  className="mt-4 flex items-center justify-between gap-3 border p-3"
                >
                  <p className="text-xs text-muted-foreground">
                    Couldn’t load more Posts.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (column.nextCursor)
                        void loadNextPage({
                          status,
                          cursor: column.nextCursor,
                        });
                    }}
                  >
                    Try again
                  </Button>
                </div>
              ) : null}
              {column.nextCursor && !errors[status] && loadMore ? (
                <Button
                  aria-label={`Load more ${heading} Posts`}
                  className="mt-4 h-10 w-full gap-2"
                  disabled={loading[status] === true}
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    void loadNextPage({
                      status,
                      cursor: column.nextCursor,
                    })
                  }
                >
                  {loading[status] ? (
                    <>
                      <Spinner aria-hidden="true" /> Loading…
                    </>
                  ) : (
                    "Load more"
                  )}
                </Button>
              ) : null}
            </RoadmapColumn>
          );
        })}
      </div>
    </main>
  );
}

export function PublicRoadmapSkeleton() {
  return (
    <main
      className="mx-auto w-full max-w-[96rem] px-6 py-10 lg:px-10"
      aria-label="Loading roadmap"
      aria-busy="true"
    >
      <RoadmapIntro />
      <div className="mt-20 grid gap-5 lg:grid-cols-3">
        {roadmapGroups.map(({ status, heading, headingId, dot }) => (
          <RoadmapColumn
            count={<Skeleton className="h-4 w-6" />}
            dot={dot}
            heading={heading}
            headingId={headingId}
            key={status}
            skeleton
          >
            <div className="grid gap-3">
              {Array.from({ length: 2 }, (_, index) => (
                <div className="border p-5" key={index}>
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="mt-3 h-4 w-full" />
                  <Skeleton className="mt-5 h-7 w-1/2" />
                </div>
              ))}
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
  dot,
  heading,
  headingId,
  skeleton = false,
}: {
  children: ReactNode;
  count: ReactNode;
  dot: string;
  heading: string;
  headingId: string;
  skeleton?: boolean;
}) {
  return (
    <Card
      className="min-w-0 gap-0 self-start p-4"
      aria-labelledby={headingId}
      {...(skeleton ? { "data-roadmap-skeleton-column": "" } : {})}
    >
      <header className="flex items-center justify-between px-1 pb-4">
        <h2
          className="flex items-center gap-2 text-sm font-medium"
          id={headingId}
        >
          <span className={`size-2.5 rounded-full ${dot}`} aria-hidden="true" />
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

function RoadmapEmptyState({ heading }: { heading: string }) {
  return (
    <Empty className="min-h-56 border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <CircleDashed aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>No Posts here yet.</EmptyTitle>
        <EmptyDescription>
          {heading} Posts will appear here when they’re available.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

function RoadmapItem({ item, masked }: { item: PublicPost; masked: boolean }) {
  return (
    <li>
      <PostLink
        slug={item.slug}
        contextual={masked}
        className="group block border bg-background/30 transition-colors duration-150 hover:bg-muted/30"
      >
        <article className="p-5">
          <h3 className="text-base font-medium group-hover:text-foreground">
            {item.title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {item.description}
          </p>
          <div
            className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground"
            role="group"
            aria-label="Post metadata"
          >
            <PostTypeBadge type={item.type} />
            <span
              className="inline-flex items-center gap-1.5"
              aria-label="Comments unavailable"
            >
              <MessageCircle className="size-4" aria-hidden="true" />
              <span aria-hidden="true">—</span>
            </span>
            <span
              className="ml-auto inline-flex h-8 min-w-12 items-center justify-center gap-1.5 border px-2.5 text-sm text-foreground"
              aria-label="Score unavailable"
            >
              <ArrowUp className="size-4" aria-hidden="true" />
              <span aria-hidden="true">—</span>
            </span>
          </div>
        </article>
      </PostLink>
    </li>
  );
}

function appendRoadmapPage(
  current: PublicRoadmapPage,
  next: PublicRoadmapPage,
): PublicRoadmapPage {
  return {
    items: [...current.items, ...next.items],
    ...(next.nextCursor ? { nextCursor: next.nextCursor } : {}),
    totalCount: next.totalCount,
  };
}

function isRoadmapStatus(value: unknown): value is RoadmapStatus {
  return roadmapGroups.some(({ status }) => status === value);
}
