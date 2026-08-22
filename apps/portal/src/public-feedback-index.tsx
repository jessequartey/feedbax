import type { PublicFeedbackQuery, PublicPostPage } from "@feedbax/feedback";
import { DraftPostList } from "./draft-post-list";
import { PostFeedControls } from "./post-feed-controls";
import { PostResults } from "./post-results";

export function PublicFeedbackIndex({
  page,
  search,
  loadMore,
  loadingMore,
  onSearchChange,
}: {
  page: PublicPostPage;
  search: PublicFeedbackQuery;
  loadMore?: () => void;
  loadingMore?: boolean;
  onSearchChange?: (search: PublicFeedbackQuery) => void;
}) {
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
        <DraftPostList search={search} />
        <PostResults
          initialItems={page.items}
          nextCursor={page.nextCursor}
          loadMore={loadMore}
          loadingMore={loadingMore}
        />
      </section>
    </main>
  );
}
