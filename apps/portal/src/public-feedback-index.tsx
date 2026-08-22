import type { PublicPostQuery, PublicPostPage } from "@feedbax/feedback";
import { Skeleton } from "@feedbax/ui/components/skeleton";
import { Card } from "@feedbax/ui/components/card";
import { Button } from "@feedbax/ui/components/button";
import { Item, ItemMedia, ItemTitle } from "@feedbax/ui/components/item";
import {
  Bug,
  CheckCircle2,
  CircleDot,
  Lightbulb,
  List,
  MessageCircle,
} from "lucide-react";
import { useAuthorizedDraftPosts } from "./draft-post-list";
import { PostFeedControls } from "./post-feed-controls";
import { PostResults } from "./post-results";

export function PublicPostIndex({
  page,
  search,
  loadMore,
  loadingMore,
  loadMoreError,
  onSearchChange,
  pending = false,
  maskPostLinks = false,
}: {
  page: PublicPostPage;
  search: PublicPostQuery;
  loadMore?: () => void;
  loadingMore?: boolean;
  loadMoreError?: boolean;
  onSearchChange?: (search: PublicPostQuery) => void;
  pending?: boolean;
  maskPostLinks?: boolean;
}) {
  const drafts = useAuthorizedDraftPosts(search);
  return (
    <main className="mx-auto w-full max-w-[96rem] px-6 py-10 lg:px-10">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <section aria-labelledby="feedback-heading">
            <h1
              id="feedback-heading"
              className="text-3xl font-semibold tracking-tight"
            >
              Feedback
            </h1>
            <p className="mt-2 text-base text-muted-foreground">
              Share ideas and vote on what matters.
            </p>
          </section>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-end">
            <PostFeedControls
              search={search}
              onSearchChange={onSearchChange}
              pending={pending}
            />
            <Button className="h-10 px-5 text-sm" render={<a href="/submit" />}>
              New post
            </Button>
          </div>
          <section className="mt-8" aria-live="polite">
            <div className="mb-4">
              <h2 className="text-lg font-medium">Posts</h2>
            </div>
            <PostResults
              drafts={drafts}
              initialItems={page.items}
              nextCursor={page.nextCursor}
              loadMore={loadMore}
              loadingMore={loadingMore}
              loadMoreError={loadMoreError}
              maskPostLinks={maskPostLinks}
            />
          </section>
        </div>
        <aside
          className="hidden border-l pl-8 lg:block"
          aria-label="Feedback navigation"
        >
          <h2 className="mb-3 mt-14 text-sm font-medium">Boards</h2>
          <Card className="gap-0 py-0">
            {[
              ["/", "All posts", List],
              ["/?types=Feature%20Request", "Feature requests", Lightbulb],
              ["/?types=Bug%20Report", "Bug reports", Bug],
              ["/?types=General%20Feedback", "General feedback", MessageCircle],
            ].map(([href, label, Icon], index) => (
              <Item
                className={`flex items-center gap-3 border-b px-4 py-3 text-sm last:border-0 ${index === 0 ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50"}`}
                render={<a href={href as string} />}
                key={label as string}
                size="sm"
              >
                <ItemMedia variant="icon">
                  <Icon className="size-4" />
                </ItemMedia>
                <ItemTitle>{label as string}</ItemTitle>
              </Item>
            ))}
          </Card>
          <h2 className="mb-3 mt-8 text-sm font-medium">Status</h2>
          <Card className="gap-0 py-0">
            {[
              ["/?statuses=Planned", "Planned", CircleDot],
              ["/?statuses=In%20Progress", "In progress", CircleDot],
              ["/?statuses=Shipped", "Shipped", CheckCircle2],
            ].map(([href, label, Icon]) => (
              <Item
                className="flex items-center gap-3 border-b px-4 py-3 text-sm text-muted-foreground last:border-0 hover:bg-muted/50"
                render={<a href={href as string} />}
                key={label as string}
                size="sm"
              >
                <ItemMedia variant="icon">
                  <Icon className="size-4" />
                </ItemMedia>
                <ItemTitle>{label as string}</ItemTitle>
              </Item>
            ))}
          </Card>
        </aside>
      </div>
    </main>
  );
}

export function PublicPostFeedSkeleton() {
  return (
    <main
      className="feedback-index feedback-feed-skeleton"
      aria-label="Loading Posts"
      aria-busy="true"
    >
      <section className="feedback-intro" aria-hidden="true">
        <Skeleton className="feedback-skeleton-heading" />
        <Skeleton className="feedback-skeleton-deck" />
      </section>
      <div className="post-controls" aria-hidden="true">
        <Skeleton className="feedback-skeleton-control" />
        <Skeleton className="feedback-skeleton-control" />
        <Skeleton className="feedback-skeleton-control" />
      </div>
      <section className="feedback-results" aria-hidden="true">
        <Skeleton className="feedback-skeleton-section-heading" />
        <ol className="feedback-list">
          {Array.from({ length: 3 }, (_, index) => (
            <li key={index} data-post-skeleton-row>
              <div className="feedback-skeleton-row">
                <Skeleton className="feedback-skeleton-meta" />
                <Skeleton className="feedback-skeleton-title" />
                <Skeleton className="feedback-skeleton-copy" />
              </div>
            </li>
          ))}
        </ol>
      </section>
      <span className="sr-only">Loading Posts…</span>
    </main>
  );
}
