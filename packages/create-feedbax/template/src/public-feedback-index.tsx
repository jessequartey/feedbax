import type { PublicPostQuery, PublicPostPage } from "@feedbax/feedback";
import type { PortalFeatures } from "@feedbax/config";
import { Skeleton } from "@feedbax/ui/components/skeleton";
import { useAuthorizedDraftPosts } from "./draft-post-list";
import {
  BoardNavigation,
  PostFeedControls,
  StatusNavigation,
} from "./post-feed-controls";
import { PostResults } from "./post-results";
import feedbax from "./feedbax";

export function PublicPostIndex({
  page,
  search,
  loadMore,
  loadingMore,
  loadMoreError,
  onSearchChange,
  pending = false,
  maskPostLinks = false,
  features = feedbax.features,
}: {
  page: PublicPostPage;
  search: PublicPostQuery;
  loadMore?: () => void;
  loadingMore?: boolean;
  loadMoreError?: boolean;
  onSearchChange?: (search: PublicPostQuery) => void;
  pending?: boolean;
  maskPostLinks?: boolean;
  features?: PortalFeatures;
}) {
  const drafts = useAuthorizedDraftPosts(search);
  return (
    <main className="mx-auto w-full max-w-[96rem] px-6 py-10 lg:px-10">
      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <section aria-labelledby="feedback-heading">
            <h1
              id="feedback-heading"
              className="text-3xl font-semibold tracking-tight"
            >
              Feedback
            </h1>
            <p className="mt-2 text-base text-muted-foreground">
              {features.voting
                ? "Share ideas and vote on what matters."
                : "Share ideas and follow public progress."}
            </p>
          </section>
          <div className="mt-8 flex flex-col gap-3 lg:flex-row lg:items-center">
            <PostFeedControls
              contextualCreatePost={maskPostLinks}
              search={search}
              onSearchChange={onSearchChange}
              pending={pending}
              features={features}
            />
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
              features={features}
            />
          </section>
        </div>
        <aside
          className="hidden border-l pl-8 pt-14 lg:block"
          aria-label="Feedback navigation"
        >
          <BoardNavigation search={search} onSearchChange={onSearchChange} />
          <div className="mt-8">
            <StatusNavigation search={search} onSearchChange={onSearchChange} />
          </div>
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
