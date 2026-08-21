import type { PublicFeedbackQuery, PublicPost } from "@feedbax/feedback";
import { useState } from "react";
import { postPath } from "./public-post-page";
import { formatPublicDate } from "./public-date";

export function PostResults({
  initialItems,
  nextCursor,
  search,
}: {
  initialItems: PublicPost[];
  nextCursor?: string;
  search: PublicFeedbackQuery;
}) {
  const [items, setItems] = useState(initialItems);
  const [cursor, setCursor] = useState(nextCursor);
  const [pending, setPending] = useState(false);
  async function loadMore() {
    if (!cursor) return;
    setPending(true);
    try {
      const { getPublicFeedbackPage } =
        await import("./public-feedback-server-function");
      const page = await getPublicFeedbackPage({ data: { ...search, cursor } });
      setItems((current) => [
        ...current,
        ...page.items.filter(
          (next) => !current.some((item) => item.slug === next.slug),
        ),
      ]);
      setCursor(page.nextCursor);
    } finally {
      setPending(false);
    }
  }
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
      {cursor ? (
        <button
          className="feedback-next"
          type="button"
          onClick={loadMore}
          disabled={pending}
        >
          {pending ? "Loading…" : "Load More"}
        </button>
      ) : null}
    </>
  );
}
