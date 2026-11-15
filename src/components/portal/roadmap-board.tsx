import { Link } from "@tanstack/react-router";
import { PostLink } from "./post-link";
import { ChevronDownIcon, MessageSquareIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { STATUS_LABELS, type RoadmapResult } from "@/contracts/domain";
import { FiltersSheet, SearchField } from "./filter-panel";
import { PageHeader } from "./page-header";
import { NewPostButton } from "./post-browser";
import { CategoryBadge, STATUS_ICONS } from "./post-badges";
import type { RoadmapSearch } from "./portal-search";
import { EmptyState } from "./states";
import { VoteButton } from "./vote-button";

const COLUMNS = ["planned", "in_progress", "done"] as const;
const layout = "mx-auto w-full max-w-[1440px] px-4 md:px-6 lg:px-8";

type Props = {
  data: RoadmapResult;
  search: RoadmapSearch;
  onChange: (patch: Partial<RoadmapSearch>) => void;
};

export function RoadmapBoard({ data, search, onChange }: Props) {
  const filtered = Boolean(search.q || search.category);
  const empty = COLUMNS.every((key) => data[key].total === 0);
  return (
    <div className={`${layout} py-6 md:py-10`}>
      <PageHeader
        title="Roadmap"
        description="What we’re planning, building and have delivered."
        actions={
          <>
            <SearchField
              label="Search the roadmap"
              value={search.q}
              onCommit={(q) => onChange({ q })}
              className="min-w-0 max-md:w-full md:w-56"
            />
            <FiltersSheet
              category={search.category}
              onCategory={(category) => onChange({ category })}
              activeCount={search.category ? 1 : 0}
            />
            <NewPostButton />
          </>
        }
      />
      {empty && filtered ? (
        <div className="mt-8 border">
          <EmptyState
            title="Nothing on the roadmap matches"
            description="Try a different search or category."
            actions={
              <Button
                variant="outline"
                className="max-md:h-11"
                onClick={() => onChange({ q: undefined, category: undefined })}
              >
                Clear filters
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-3 md:items-start md:gap-6">
          {COLUMNS.map((key) => {
            const column = data[key];
            const Icon = STATUS_ICONS[key];
            const more = column.total - column.items.length;
            return (
              <section
                key={key}
                aria-labelledby={`roadmap-${key}`}
                className="border bg-muted/20 p-3 md:p-4"
              >
                <header className="mb-3 flex items-center justify-between gap-2">
                  <h2 id={`roadmap-${key}`} className="flex items-center gap-2 text-sm font-medium">
                    <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                    {STATUS_LABELS[key]}
                  </h2>
                  <span
                    className="text-sm text-muted-foreground tabular-nums"
                    aria-label={`${column.total} posts`}
                  >
                    {column.total}
                  </span>
                </header>
                {column.items.length === 0 ? (
                  <p className="border border-dashed px-3 py-8 text-center text-sm text-muted-foreground">
                    Nothing here yet.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {column.items.map((post) => (
                      <li
                        key={post.id}
                        className="relative border bg-background p-3 transition-colors hover:bg-muted/40"
                      >
                        <h3 className="text-sm leading-snug font-medium break-words">
                          <PostLink
                            postId={post.id}
                            className="outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring/60 focus-visible:after:ring-inset"
                          >
                            {post.title}
                          </PostLink>
                        </h3>
                        {post.excerpt ? (
                          <p className="mt-1 line-clamp-2 text-xs break-words text-muted-foreground">
                            {post.excerpt}
                          </p>
                        ) : null}
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <CategoryBadge category={post.category} />
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MessageSquareIcon className="size-3.5" aria-hidden="true" />
                              <span className="sr-only">Comments: </span>
                              {post.comments}
                            </span>
                          </div>
                          <VoteButton
                            variant="inline"
                            postId={post.id}
                            postTitle={post.title}
                            votes={post.votes}
                            voted={post.viewerHasVoted}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {more > 0 ? (
                  <Link
                    to="/"
                    search={{ status: key, category: search.category, q: search.q, sort: "top" }}
                    className="mt-3 flex h-9 items-center justify-center gap-1 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 max-md:h-11"
                  >
                    View {more} more <ChevronDownIcon className="size-4" aria-hidden="true" />
                  </Link>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function RoadmapSkeleton() {
  return (
    <div className={`${layout} py-6 md:py-10`}>
      <PageHeader title="Roadmap" description="What we’re planning, building and have delivered." />
      <div className="mt-8 grid gap-4 md:grid-cols-3 md:gap-6" aria-busy="true">
        {COLUMNS.map((key) => (
          <div key={key} className="border bg-muted/20 p-3 md:p-4">
            <Skeleton className="mb-3 h-5 w-28" />
            <div className="flex flex-col gap-3">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-28 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
