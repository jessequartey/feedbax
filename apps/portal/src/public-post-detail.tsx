import type { PublicPost } from "@feedbax/feedback";
import type { PortalFeatures } from "@feedbax/config";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@feedbax/ui/components/empty";
import { Skeleton } from "@feedbax/ui/components/skeleton";
import { ArrowLeft, ArrowUp, MessageCircle } from "lucide-react";
import { type ReactNode, useId } from "react";
import { PostStatusBadge, PostTypeBadge } from "./post-badges";
import { formatPublicDate } from "./public-date";
import feedbax from "./feedbax";

export function PublicPostDetail({
  post,
  display = "page",
  summaryActions,
  summaryMarker,
  features = feedbax.features,
}: {
  post: PublicPost;
  display?: "overlay" | "page";
  summaryActions?: ReactNode;
  summaryMarker?: ReactNode;
  features?: PortalFeatures;
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
          {features.voting || features.comments ? (
            <div className="post-detail-engagement">
              {features.voting ? (
                <span aria-label="Score unavailable">
                  <ArrowUp aria-hidden="true" />
                  <span aria-hidden="true">—</span>
                </span>
              ) : null}
              {features.comments ? (
                <span aria-label="Comments unavailable">
                  <MessageCircle aria-hidden="true" />
                  <span aria-hidden="true">— comments</span>
                </span>
              ) : null}
            </div>
          ) : null}
          {features.comments ? (
            <section
              className="post-detail-comments"
              aria-labelledby={commentsHeadingId}
            >
              <h2 id={commentsHeadingId}>Comments</h2>
              <Empty className="post-detail-comments-empty">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <MessageCircle aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>No comments yet</EmptyTitle>
                </EmptyHeader>
              </Empty>
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
