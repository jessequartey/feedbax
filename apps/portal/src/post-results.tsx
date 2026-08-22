import type { DraftPost, PublicPost } from "@feedbax/feedback";
import { formatPublicDate } from "./public-date";
import { PostLink } from "./masked-post-link";

export function PostResults({
  drafts = [],
  initialItems,
  nextCursor,
  loadMore,
  loadingMore = false,
  loadMoreError = false,
  maskPostLinks = false,
}: {
  drafts?: DraftPost[];
  initialItems: PublicPost[];
  nextCursor?: string;
  loadMore?: () => void;
  loadingMore?: boolean;
  loadMoreError?: boolean;
  maskPostLinks?: boolean;
}) {
  const items = initialItems;
  if (!drafts.length && !items.length)
    return (
      <div className="feedback-empty">
        <p>No Posts match this view.</p>
        <a href="/">Clear filters</a>
      </div>
    );
  return (
    <>
      <ol className="feedback-list">
        {drafts.map((post) => (
          <li key={post.id}>
            <PostLink
              className="post-link draft-post-link"
              slug={post.slug}
              contextual={maskPostLinks}
            >
              <article>
                <div className="feedback-meta">
                  <strong>Draft</strong>
                  <span>{post.type}</span>
                  <time dateTime={new Date(post.updatedAt).toISOString()}>
                    {formatPublicDate(new Date(post.updatedAt))}
                  </time>
                </div>
                <h3>{post.title}</h3>
                <p>{post.description}</p>
              </article>
            </PostLink>
          </li>
        ))}
        {items.map((post) => (
          <li key={post.slug}>
            <PostLink
              className="post-link"
              slug={post.slug}
              contextual={maskPostLinks}
            >
              <article>
                <div className="feedback-meta">
                  <span>{post.type}</span>
                  <span data-status={post.status}>{post.status}</span>
                  <time dateTime={post.createdAt.toISOString()}>
                    {formatPublicDate(post.createdAt)}
                  </time>
                </div>
                <h3>{post.title}</h3>
                <p>{post.description}</p>
              </article>
            </PostLink>
          </li>
        ))}
      </ol>
      {loadMoreError ? (
        <div role="alert" className="feedback-pagination-error">
          <p>Couldn’t load more Posts.</p>
          <button type="button" onClick={loadMore}>
            Try again
          </button>
        </div>
      ) : null}
      {nextCursor ? (
        <button
          className="feedback-next"
          type="button"
          onClick={loadMore}
          disabled={loadingMore || loadMoreError || !loadMore}
        >
          {loadingMore ? "Loading…" : "Load More"}
        </button>
      ) : null}
    </>
  );
}
