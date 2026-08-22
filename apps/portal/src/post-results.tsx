import type { PublicPost } from "@feedbax/feedback";
import { postPath } from "./public-post-page";
import { formatPublicDate } from "./public-date";

export function PostResults({
  initialItems,
  nextCursor,
  loadMore,
  loadingMore = false,
}: {
  initialItems: PublicPost[];
  nextCursor?: string;
  loadMore?: () => void;
  loadingMore?: boolean;
}) {
  const items = initialItems;
  if (!items.length)
    return (
      <div className="feedback-empty">
        <p>No Posts match this view.</p>
        <a href="/">Clear filters</a>
      </div>
    );
  return (
    <>
      <ol className="feedback-list">
        {items.map((post) => (
          <li key={post.slug}>
            <a className="feedback-item-link" href={postPath(post)}>
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
            </a>
          </li>
        ))}
      </ol>
      {nextCursor ? (
        <button
          className="feedback-next"
          type="button"
          onClick={loadMore}
          disabled={loadingMore || !loadMore}
        >
          {loadingMore ? "Loading…" : "Load More"}
        </button>
      ) : null}
    </>
  );
}
