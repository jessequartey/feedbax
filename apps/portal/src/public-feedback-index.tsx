import type { PublicPostQuery, PublicPostPage } from "@feedbax/feedback";
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
  maskPostLinks = false,
}: {
  page: PublicPostPage;
  search: PublicPostQuery;
  loadMore?: () => void;
  loadingMore?: boolean;
  loadMoreError?: boolean;
  onSearchChange?: (search: PublicPostQuery) => void;
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
      <PostFeedControls search={search} onSearchChange={onSearchChange} />
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
