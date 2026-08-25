import type { DraftPost, PublicPost } from "@feedbax/feedback";
import { Badge } from "@feedbax/ui/components/badge";
import { Button } from "@feedbax/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@feedbax/ui/components/empty";
import { ArrowUp, MessageCircle, SearchX } from "lucide-react";

import { PostLink } from "./masked-post-link";
import { PostStatusBadge, PostTypeBadge } from "./post-badges";

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
  if (!drafts.length && !initialItems.length) {
    return (
      <Empty className="min-h-72 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchX aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>No Posts match this view.</EmptyTitle>
          <EmptyDescription>
            Try another Board or remove a Status filter.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            render={<a href="/" />}
            nativeButton={false}
            variant="outline"
          >
            Clear filters
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <>
      <ol className="divide-y overflow-hidden border bg-card/30">
        {drafts.map((post) => (
          <PostResultRow
            key={post.id}
            post={post}
            draft
            maskPostLinks={maskPostLinks}
          />
        ))}
        {initialItems.map((post) => (
          <PostResultRow
            key={post.slug}
            post={post}
            maskPostLinks={maskPostLinks}
          />
        ))}
      </ol>
      {loadMoreError ? (
        <div role="alert" className="mt-6 flex items-center gap-3 border p-4">
          <p className="mr-auto text-sm">Couldn’t load more Posts.</p>
          <Button type="button" onClick={loadMore}>
            Try again
          </Button>
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

function PostResultRow({
  post,
  draft = false,
  maskPostLinks,
}: {
  post: DraftPost | PublicPost;
  draft?: boolean;
  maskPostLinks: boolean;
}) {
  return (
    <li>
      <PostLink
        className={draft ? "post-link draft-post-link" : "post-link"}
        slug={post.slug}
        contextual={maskPostLinks}
      >
        <article className="relative grid grid-cols-[4rem_minmax(0,1fr)] items-start gap-4 p-5 transition-colors duration-150 hover:bg-muted/30 sm:grid-cols-[4.75rem_minmax(0,1fr)] sm:items-center">
          <span
            className="flex h-[4.75rem] w-full flex-col items-center justify-center gap-1 border text-sm font-medium text-muted-foreground"
            aria-label="Score unavailable"
          >
            <ArrowUp className="size-5" aria-hidden="true" />
            <span aria-hidden="true">—</span>
          </span>
          <span className="min-w-0 sm:pr-16">
            <span className="block text-base font-medium text-foreground sm:text-lg">
              {post.title}
            </span>
            <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
              {post.description}
            </span>
            <span
              className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
              role="group"
              aria-label="Post metadata"
            >
              <PostTypeBadge type={post.type} />
              {draft ? (
                <Badge variant="outline">Draft</Badge>
              ) : (
                <PostStatusBadge status={post.status} />
              )}
              <span
                className="ml-auto inline-flex items-center gap-2 text-sm text-muted-foreground sm:absolute sm:top-1/2 sm:right-5 sm:-translate-y-1/2"
                aria-label="Comments unavailable"
              >
                <MessageCircle className="size-4" aria-hidden="true" />
                <span aria-hidden="true">—</span>
              </span>
            </span>
          </span>
        </article>
      </PostLink>
    </li>
  );
}
