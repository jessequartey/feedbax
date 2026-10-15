import type { PublicPostQuery, PublicPostPage } from "@feedbax/feedback";
import type { PortalFeatures } from "@feedbax/config";
import Loader from "./components/loader";
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
              className="text-2xl font-semibold tracking-tight"
            >
              Feedback
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
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
          <section
            className="mt-8"
            aria-live="polite"
            aria-label="Feedback posts"
          >
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
  return <Loader label="Loading Posts" />;
}
