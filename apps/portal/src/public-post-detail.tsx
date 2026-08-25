import type { CommentThreadPage, PublicPost } from "@feedbax/feedback";
import type { PortalFeatures } from "@feedbax/config";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@feedbax/ui/components/empty";
import { Skeleton } from "@feedbax/ui/components/skeleton";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { type ReactNode, useId } from "react";
import { PostStatusBadge, PostTypeBadge } from "./post-badges";
import { formatPublicDate } from "./public-date";
import feedbax from "./feedbax";
import { VoteToggle } from "./vote-toggle";

export function PublicPostDetail({
  post,
  display = "page",
  summaryActions,
  summaryMarker,
  features = feedbax.features,
  comments = { items: [] },
  loadMore,
}: {
  post: PublicPost;
  display?: "overlay" | "page";
  summaryActions?: ReactNode;
  summaryMarker?: ReactNode;
  features?: PortalFeatures;
  comments?: CommentThreadPage;
  loadMore?: () => Promise<void>;
}) {
  const id = useId();
  const headingId = `${id}-post-heading`;
  const commentsHeadingId = `${id}-post-comments-heading`;
  const detailsHeadingId = `${id}-post-details-heading`;

  return (
    <main className="feedback-detail public-post-detail" data-display={display}>
      {display === "page" ? (
        <a className="feedback-detail-back" href="/">
          <ArrowLeft aria-hidden="true" /> Back to Feedback
        </a>
      ) : null}
      <article className="post-detail-layout" aria-labelledby={headingId}>
        <div className="post-detail-primary">
          <div className="feedback-detail-meta">
            <PostTypeBadge type={post.type} />
            <PostStatusBadge status={post.status} />
            {summaryMarker}
          </div>
          <h1 id={headingId}>{post.title}</h1>
          <p className="feedback-detail-description">{post.description}</p>
          {summaryActions ? (
            <div className="post-detail-summary-actions">{summaryActions}</div>
          ) : null}
          {features.voting && post.voteCount !== undefined ? (
            <div className="post-detail-engagement">
              <VoteToggle post={post} />
            </div>
          ) : null}
          {features.comments ? (
            <section
              className="post-detail-comments"
              aria-labelledby={commentsHeadingId}
            >
              <h2 id={commentsHeadingId}>Comments</h2>
              {comments.items.length === 0 ? (
                <Empty className="post-detail-comments-empty">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <MessageCircle aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyTitle>No comments yet</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="comment-threads">
                  {comments.items.map((thread) => (
                    <article className="comment-thread" key={thread.id}>
                      {thread.comments.map((comment) => (
                        <div className="comment" key={comment.id}>
                          <header>
                            <strong>{comment.author.displayName}</strong>
                            {comment.author.kind === "participant" ? (
                              <span>Unverified</span>
                            ) : null}
                            <time dateTime={comment.createdAt.toISOString()}>
                              {formatPublicDate(comment.createdAt, "long")}
                            </time>
                          </header>
                          <p>{comment.body}</p>
                        </div>
                      ))}
                    </article>
                  ))}
                </div>
              )}
              {loadMore ? (
                <button
                  type="button"
                  className="button"
                  onClick={() => void loadMore()}
                >
                  Load more
                </button>
              ) : null}
            </section>
          ) : null}
        </div>
        <aside
          className="post-detail-sidebar"
          aria-labelledby={detailsHeadingId}
        >
          <h2 id={detailsHeadingId}>Details</h2>
          <dl className="post-detail-details">
            <div>
              <dt>Status</dt>
              <dd>
                <PostStatusBadge status={post.status} />
              </dd>
            </div>
            <div>
              <dt>Post type</dt>
              <dd>{post.type}</dd>
            </div>
            <div>
              <dt>Submitted</dt>
              <dd>
                <time dateTime={post.createdAt.toISOString()}>
                  {formatPublicDate(post.createdAt, "long")}
                </time>
              </dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>
                <time dateTime={post.updatedAt.toISOString()}>
                  {formatPublicDate(post.updatedAt, "long")}
                </time>
              </dd>
            </div>
          </dl>
        </aside>
      </article>
    </main>
  );
}

export function PublicPostDetailSkeleton() {
  return (
    <main
      className="feedback-detail post-detail-skeleton"
      aria-label="Loading Post details"
      aria-busy="true"
    >
      <div aria-hidden="true">
        <Skeleton className="post-detail-skeleton-back" />
        <article>
          <Skeleton className="post-detail-skeleton-meta" />
          <Skeleton className="post-detail-skeleton-title" />
          <Skeleton className="post-detail-skeleton-copy" />
          <Skeleton className="post-detail-skeleton-copy post-detail-skeleton-copy-short" />
        </article>
      </div>
      <span className="sr-only">Loading Post details…</span>
    </main>
  );
}
