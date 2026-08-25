import type { PublicPost } from "@feedbax/feedback";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@feedbax/ui/components/empty";
import { Skeleton } from "@feedbax/ui/components/skeleton";
import { ArrowLeft, ArrowUp, MessageCircle } from "lucide-react";
import { PostStatusBadge, PostTypeBadge } from "./post-badges";
import { formatPublicDate } from "./public-date";

export function PublicPostDetail({
  post,
  display = "page",
}: {
  post: PublicPost;
  display?: "overlay" | "page";
}) {
  return (
    <main className="feedback-detail public-post-detail" data-display={display}>
      {display === "page" ? (
        <a className="feedback-detail-back" href="/">
          <ArrowLeft aria-hidden="true" /> Back to Feedback
        </a>
      ) : null}
      <article className="post-detail-layout" aria-labelledby="post-heading">
        <div className="post-detail-primary">
          <div className="feedback-detail-meta">
            <PostTypeBadge type={post.type} />
            <PostStatusBadge status={post.status} />
          </div>
          <h1 id="post-heading">{post.title}</h1>
          <p className="feedback-detail-description">{post.description}</p>
          <div className="post-detail-engagement">
            <span aria-label="Score unavailable">
              <ArrowUp aria-hidden="true" />
              <span aria-hidden="true">—</span>
            </span>
            <span aria-label="Comments unavailable">
              <MessageCircle aria-hidden="true" />
              <span aria-hidden="true">— comments</span>
            </span>
          </div>
          <section
            className="post-detail-comments"
            aria-labelledby="post-comments-heading"
          >
            <h2 id="post-comments-heading">Comments</h2>
            <Empty className="post-detail-comments-empty">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MessageCircle aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>No comments yet</EmptyTitle>
                <EmptyDescription>
                  Commenting isn’t available in this installation.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </section>
        </div>
        <aside
          className="post-detail-sidebar"
          aria-labelledby="post-details-heading"
        >
          <h2 id="post-details-heading">Details</h2>
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
