import * as React from "react";
import { Link } from "@tanstack/react-router";
import { PlusIcon, SearchXIcon, InboxIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CATEGORY_LABELS, STATUS_LABELS, type Page, type PostSummary } from "@/contracts/domain";
import { FilterPanel, FiltersSheet, SearchField, SortControl } from "./filter-panel";
import { PageHeader } from "./page-header";
import { PaginationBar } from "./pagination-bar";
import { PostList, PostListSkeleton } from "./post-row";
import { clearFilters, hasActiveFilters, type BoardSearch } from "./portal-search";
import { EmptyState } from "./states";

export function NewPostButton({ className }: { className?: string }) {
  return (
    <Button
      render={<Link to="/submit" />}
      nativeButton={false}
      className={className ?? "h-9 max-md:h-11"}
    >
      <PlusIcon aria-hidden="true" />
      New post
    </Button>
  );
}

export function describeFilters(search: BoardSearch): string {
  const parts: string[] = [];
  if (search.category) parts.push(CATEGORY_LABELS[search.category]);
  if (search.status) parts.push(`status “${STATUS_LABELS[search.status]}”`);
  if (search.q) parts.push(`matching “${search.q}”`);
  return parts.join(", ");
}

const layout = "mx-auto w-full max-w-[1440px] px-4 md:px-6 lg:px-8";

type Props = {
  title: string;
  description: string;
  /** Which empty state to explain with. */
  kind: "board" | "mine";
  search: BoardSearch;
  page: Page<PostSummary>;
  onChange: (patch: Partial<BoardSearch>) => void;
  onClear: () => void;
};

/** The board and My feedback share this: header, controls, bordered list and the 280 px sidebar. */
export function PostBrowser({ title, description, kind, search, page, onChange, onClear }: Props) {
  const filtered = hasActiveFilters(search);
  const activeCount = [search.category, search.status].filter(Boolean).length;
  const panel = {
    category: search.category,
    status: search.status,
    onCategory: (category: BoardSearch["category"]) => onChange({ category }),
    onStatus: (status: BoardSearch["status"]) => onChange({ status }),
  };

  return (
    <div className={layout}>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-w-0 py-6 md:py-10 lg:pr-8" aria-labelledby="page-title">
          <PageHeader title={title} description={description} />
          <div className="mt-6 flex flex-col gap-3 md:mt-8 md:flex-row md:items-center md:justify-between">
            <SortControl
              value={search.sort ?? "trending"}
              onChange={(sort) => onChange({ sort })}
            />
            <div className="flex flex-wrap items-center gap-2">
              <NewPostButton className="h-9 max-md:h-11 max-md:w-full md:order-last" />
              <div className="flex w-full gap-2 md:w-auto">
                <SearchField
                  value={search.q}
                  onCommit={(q) => onChange({ q })}
                  className="min-w-0 flex-1 md:w-56 md:flex-none"
                />
                <FiltersSheet {...panel} activeCount={activeCount} className="lg:hidden" />
              </div>
            </div>
          </div>

          <h2 className="mt-8 mb-3 text-sm font-medium">
            Posts{" "}
            <span className="font-normal text-muted-foreground" aria-live="polite">
              {page.total > 0 ? `(${page.total.toLocaleString("en-US")})` : ""}
            </span>
          </h2>
          {page.items.length > 0 ? (
            <>
              <PostList posts={page.items} />
              <PaginationBar page={page} onPage={(next) => onChange({ page: next })} />
            </>
          ) : (
            <div className="border">
              {filtered ? (
                <EmptyState
                  icon={SearchXIcon}
                  title="No posts match"
                  description={`Nothing found for ${describeFilters(search)}. Try a different search or clear the filters.`}
                  actions={
                    <>
                      <Button variant="outline" className="max-md:h-11" onClick={onClear}>
                        Clear filters
                      </Button>
                      {kind === "board" ? <NewPostButton /> : null}
                    </>
                  }
                />
              ) : kind === "mine" ? (
                <EmptyState
                  icon={InboxIcon}
                  title="You haven't posted yet"
                  description="Posts you submit show up here, so you can follow their status."
                  actions={<NewPostButton />}
                />
              ) : (
                <EmptyState
                  icon={InboxIcon}
                  title="No feedback yet"
                  description="Be the first to share an idea or report a bug."
                  actions={<NewPostButton />}
                />
              )}
            </div>
          )}
        </section>
        <aside aria-label="Filters" className="hidden border-l py-10 pl-8 lg:block">
          <FilterPanel {...panel} />
        </aside>
      </div>
    </div>
  );
}

export function PostBrowserSkeleton({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className={layout}>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_280px]">
        <section className="min-w-0 py-6 md:py-10 lg:pr-8">
          <PageHeader title={title} description={description} />
          <div className="mt-6 flex flex-col gap-3 md:mt-8 md:flex-row md:justify-between">
            <Skeleton className="h-11 w-full md:h-9 md:w-60" />
            <Skeleton className="h-11 w-full md:h-9 md:w-96" />
          </div>
          <h2 className="mt-8 mb-3 text-sm font-medium">Posts</h2>
          <PostListSkeleton />
        </section>
        <aside className="hidden border-l py-10 pl-8 lg:block" aria-hidden="true">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="mt-3 h-44 w-full" />
        </aside>
      </div>
    </div>
  );
}

export { clearFilters };
