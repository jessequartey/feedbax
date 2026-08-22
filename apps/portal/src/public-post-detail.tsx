import type { PublicPost } from "@feedbax/feedback";
import { Skeleton } from "@feedbax/ui/components/skeleton";
import { ArrowLeft } from "lucide-react";
import { formatPublicDate } from "./public-date";

export function PublicPostDetail({ post }: { post: PublicPost }) {
  return (
    <main className="feedback-detail">
      <a className="feedback-detail-back" href="/">
        <ArrowLeft aria-hidden="true" /> Back to Feedback
      </a>
      <article aria-labelledby="post-heading">
        <div className="feedback-detail-meta">
          <span>{post.type}</span>
          <span>{post.status}</span>
        </div>
        <h1 id="post-heading">{post.title}</h1>
        <p className="feedback-detail-description">{post.description}</p>
        <dl className="feedback-detail-dates">
          <div>
            <dt>Submitted</dt>
            <dd>
              <time dateTime={post.createdAt.toISOString()}>
                {formatPublicDate(post.createdAt, "long")}
              </time>
            </dd>
          </div>
          <div>
            <dt>Last updated</dt>
            <dd>
              <time dateTime={post.updatedAt.toISOString()}>
                {formatPublicDate(post.updatedAt, "long")}
              </time>
            </dd>
          </div>
        </dl>
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
