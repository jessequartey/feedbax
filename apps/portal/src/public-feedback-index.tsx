import type { PublicPostQuery, PublicPostPage } from "@feedbax/feedback";
import { Skeleton } from "@feedbax/ui/components/skeleton";
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
    <main className="feedback-index">
      <section className="feedback-intro" aria-labelledby="feedback-heading">
        <h1 id="feedback-heading">Help shape what we build</h1>
        <p className="feedback-deck">
          Share ideas, report bugs, and follow the Posts shaping the product.
        </p>
      </section>
      <PostFeedControls
        search={search}
        onSearchChange={onSearchChange}
        pending={pending}
      />
      <section className="feedback-results" aria-live="polite">
        <div className="feedback-results-heading">
          <h2>Posts</h2>
          <span>{page.items.length} shown</span>
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
