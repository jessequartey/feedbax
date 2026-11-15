import { Link } from "@tanstack/react-router";
import { EyeOffIcon, MessageSquareIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { PostSummary } from "@/contracts/domain";
import { formatDate } from "./format";
import { CategoryBadge, StatusBadge } from "./post-badges";
import { VoteButton } from "./vote-button";

export function PostRow({ post }: { post: PostSummary }) {
  return (
    <li className="relative flex gap-4 p-4 transition-colors hover:bg-muted/40 md:gap-5 md:p-5">
      <VoteButton
        postId={post.id}
        postTitle={post.title}
        votes={post.votes}
        voted={post.viewerHasVoted}
      />
      <div className="min-w-0 flex-1">
        <h3 className="text-base leading-snug font-medium md:text-lg">
          <Link
            to="/posts/$postId"
            params={{ postId: post.id }}
            className="break-words outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-ring/60 focus-visible:after:ring-inset"
          >
            {post.title}
          </Link>
        </h3>
        {post.excerpt ? (
          <p className="mt-1 line-clamp-2 text-sm break-words text-muted-foreground">
            {post.excerpt}
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2">
          {post.hidden ? (
            <Badge variant="secondary" className="h-6 gap-1.5 px-2 font-normal">
              <EyeOffIcon aria-hidden="true" />
              Hidden
            </Badge>
          ) : null}
          <CategoryBadge category={post.category} />
          <StatusBadge status={post.status} />
          <span className="flex items-center gap-1 text-sm text-muted-foreground md:hidden">
            <MessageSquareIcon className="size-4" aria-hidden="true" />
            <span className="sr-only">Comments: </span>
            {post.comments}
          </span>
          <span className="text-xs text-muted-foreground">
            {post.author.name} · {formatDate(post.createdAt)}
          </span>
        </div>
      </div>
      <div className="hidden shrink-0 items-center gap-1.5 self-center text-sm text-muted-foreground md:flex">
        <MessageSquareIcon className="size-4" aria-hidden="true" />
        <span className="sr-only">Comments: </span>
        {post.comments}
      </div>
    </li>
  );
}

export function PostList({ posts }: { posts: readonly PostSummary[] }) {
  return (
    <ul className="divide-y border" aria-label="Posts">
      {posts.map((post) => (
        <PostRow key={post.id} post={post} />
      ))}
    </ul>
  );
}

/** Same geometry as PostRow so the page doesn't jump. */
export function PostListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <ul className="divide-y border" aria-busy="true" aria-label="Loading posts">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className="flex gap-4 p-4 md:gap-5 md:p-5">
          <Skeleton className="size-14 shrink-0 md:size-16" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="mt-2 h-4 w-full max-w-lg" />
            <div className="mt-3 flex gap-2">
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-6 w-20" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
