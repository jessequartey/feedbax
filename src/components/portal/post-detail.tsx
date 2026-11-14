import { ShowcaseSlot } from "./showcase-card";
import { Link } from "@tanstack/react-router";
import * as React from "react";
import { ArrowLeftIcon, EyeOffIcon, ExternalLinkIcon, MessageSquareIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import {
  CATEGORY_LABELS,
  STATUS_LABELS,
  type CommentView,
  type Page,
  type PostDetail,
} from "@/contracts/domain";
import { CommentSection } from "./comments";
import { formatDate, plural } from "./format";
import { ImageGallery } from "./image-gallery";
import { CategoryBadge, StatusBadge } from "./post-badges";
import { VoteButton } from "./vote-button";

const layout = "mx-auto w-full max-w-[1440px] px-4 md:px-6 lg:px-8";

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right break-words">{children}</dd>
    </div>
  );
}

export function PostDetailView({
  post,
  comments,
}: {
  post: PostDetail;
  comments: Page<CommentView>;
}) {
  const [commentTotal, setCommentTotal] = React.useState(comments.total);
  return (
    <div className={`${layout} py-6 md:py-10`}>
      <Link
        to="/"
        className="inline-flex h-9 items-center gap-1.5 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 max-md:h-11"
      >
        <ArrowLeftIcon className="size-4" aria-hidden="true" /> All feedback
      </Link>
      <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-0">
        <article className="min-w-0 lg:pr-8" aria-labelledby="post-title">
          {post.hidden ? (
            <p
              role="note"
              className="mb-4 flex items-center gap-2 border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
            >
              <EyeOffIcon className="size-4 shrink-0" aria-hidden="true" />
              This post is hidden. Only its author and the admins can see it.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <CategoryBadge category={post.category} />
            <StatusBadge status={post.status} />
          </div>
          <h1
            id="post-title"
            className="mt-4 text-3xl leading-tight font-semibold tracking-tight break-words md:text-4xl"
          >
            {post.title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {post.author.name} · <time dateTime={post.createdAt}>{formatDate(post.createdAt)}</time>
          </p>
          <p className="mt-5 text-base leading-relaxed break-words whitespace-pre-wrap">
            {post.body}
          </p>
          {post.images.length > 0 ? (
            <div className="mt-6">
              <ImageGallery images={post.images} title={post.title} />
            </div>
          ) : null}
          <div className="mt-6 flex items-center justify-between gap-4 border-t pt-5">
            <VoteButton
              variant="inline"
              postId={post.id}
              postTitle={post.title}
              votes={post.votes}
              voted={post.viewerHasVoted}
            />
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MessageSquareIcon className="size-4" aria-hidden="true" />
              {plural(commentTotal, "comment")}
            </span>
          </div>
          <CommentSection postId={post.id} initial={comments} onTotalChange={setCommentTotal} />
        </article>
        <aside aria-labelledby="details-heading" className="lg:border-l lg:pl-8">
          <h2 id="details-heading" className="text-sm font-medium">
            Details
          </h2>
          <dl className="mt-2 divide-y border-y">
            <Detail label="Status">{STATUS_LABELS[post.status]}</Detail>
            <Detail label="Category">{CATEGORY_LABELS[post.category]}</Detail>
            <Detail label="Submitted">{formatDate(post.createdAt)}</Detail>
            <Detail label="Updated">{formatDate(post.updatedAt)}</Detail>
            <Detail label="Author">{post.author.name}</Detail>
            {post.githubUrl ? (
              <Detail label="GitHub">
                <a
                  href={post.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline underline-offset-4"
                >
                  Issue <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </Detail>
            ) : null}
          </dl>
          <ShowcaseSlot />
        </aside>
      </div>
    </div>
  );
}

export function PostDetailSkeleton() {
  return (
    <div className={`${layout} py-6 md:py-10`} aria-busy="true">
      <Skeleton className="h-5 w-28" />
      <div className="mt-4 grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div>
          <div className="flex gap-2">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-6 w-20" />
          </div>
          <Skeleton className="mt-4 h-10 w-3/4" />
          <Skeleton className="mt-3 h-4 w-48" />
          <Skeleton className="mt-6 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-2/3" />
          <Skeleton className="mt-8 h-9 w-24" />
          <Skeleton className="mt-8 h-24 w-full" />
        </div>
        <Skeleton className="hidden h-52 w-full lg:block" />
      </div>
    </div>
  );
}
