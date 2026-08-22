import type { DraftPost, PublicPost } from "@feedbax/feedback";
import { formatPublicDate } from "./public-date";
import { PostLink } from "./masked-post-link";
import { ArrowUp, MessageCircle } from "lucide-react";
import { Badge } from "@feedbax/ui/components/badge";
import { Button } from "@feedbax/ui/components/button";

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
      <ol className="divide-y overflow-hidden border bg-card/30">
        {drafts.map((post) => (
          <li key={post.id}>
            <PostLink
              className="post-link draft-post-link"
              slug={post.slug}
              contextual={maskPostLinks}
            >
              <article className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-4 p-5 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto]">
                <Button
                  render={<span />}
                  className="h-16 w-full flex-col gap-0 text-muted-foreground"
                  variant="outline"
                  aria-hidden="true"
                >
                  <ArrowUp />—
                </Button>
                <div className="min-w-0">
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">Draft</Badge>
                    <Badge variant="outline">{post.type}</Badge>
                    <time dateTime={new Date(post.updatedAt).toISOString()}>
                      {formatPublicDate(new Date(post.updatedAt))}
                    </time>
                  </div>
                  <h3 className="text-base font-medium sm:text-lg">
                    {post.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {post.description}
                  </p>
                </div>
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
              <article className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-4 p-5 transition-colors hover:bg-muted/30 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto]">
                <Button
                  render={<span />}
                  className="h-16 w-full flex-col gap-0 text-muted-foreground"
                  variant="outline"
                  aria-hidden="true"
                >
                  <ArrowUp />—
                </Button>
                <div className="min-w-0">
                  <h3 className="text-base font-medium sm:text-lg">
                    {post.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {post.description}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{post.type}</Badge>
                    <Badge variant="outline" data-status={post.status}>
                      {post.status}
                    </Badge>
                    <time dateTime={post.createdAt.toISOString()}>
                      {formatPublicDate(post.createdAt)}
                    </time>
                  </div>
                </div>
                <span
                  className="col-start-2 inline-flex items-center justify-self-end gap-2 text-sm text-muted-foreground sm:col-start-auto"
                  aria-label="Comments unavailable"
                >
                  <MessageCircle className="size-4" />—
                </span>
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
        <Button
          className="mt-6"
          type="button"
          onClick={loadMore}
          disabled={loadingMore || loadMoreError || !loadMore}
        >
          {loadingMore ? "Loading…" : "Load More"}
        </Button>
      ) : null}
    </>
  );
}
