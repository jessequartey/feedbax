import type { DraftPost, PublicPost } from "@feedbax/feedback";
import type { PortalFeatures } from "@feedbax/config";
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
import { MessageCircle, SearchX } from "lucide-react";

import { PostLink } from "./masked-post-link";
import { PostStatusBadge, PostTypeBadge } from "./post-badges";
import feedbax from "./feedbax";
import { VoteToggle } from "./vote-toggle";

export function PostResults({
  drafts = [],
  initialItems,
  nextCursor,
  loadMore,
  loadingMore = false,
  loadMoreError = false,
  maskPostLinks = false,
  features = feedbax.features,
}: {
  drafts?: DraftPost[];
  initialItems: PublicPost[];
  nextCursor?: string;
  loadMore?: () => void;
  loadingMore?: boolean;
  loadMoreError?: boolean;
  maskPostLinks?: boolean;
  features?: PortalFeatures;
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
            features={features}
          />
        ))}
        {initialItems.map((post) => (
          <PostResultRow
            key={post.slug}
            post={post}
            maskPostLinks={maskPostLinks}
            features={features}
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
  features,
}: {
  post: DraftPost | PublicPost;
  draft?: boolean;
  maskPostLinks: boolean;
  features: PortalFeatures;
}) {
  const votingEligible =
    features.voting &&
    !draft &&
    "voteCount" in post &&
    post.voteCount !== undefined;
  return (
    <li className="relative">
      {votingEligible ? (
        <div className="absolute top-5 left-5 z-10 flex h-[4.75rem] w-16 items-center justify-center sm:w-[4.75rem]">
          <VoteToggle post={post} />
        </div>
      ) : null}
      <PostLink
        className={draft ? "post-link draft-post-link" : "post-link"}
        slug={post.slug}
        contextual={maskPostLinks}
      >
        <article
          className={`relative grid ${features.voting ? "grid-cols-[4rem_minmax(0,1fr)] sm:grid-cols-[4.75rem_minmax(0,1fr)]" : "grid-cols-1"} items-start gap-4 p-5 transition-colors duration-150 hover:bg-muted/30 sm:items-center`}
        >
          {features.voting ? (
            <span className="h-[4.75rem]" aria-hidden="true" />
          ) : null}
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
              {features.comments ? (
                <span
                  className="ml-auto inline-flex items-center gap-2 text-sm text-muted-foreground sm:absolute sm:top-1/2 sm:right-5 sm:-translate-y-1/2"
                  aria-label="Comments unavailable"
                >
                  <MessageCircle className="size-4" aria-hidden="true" />
                  <span aria-hidden="true">—</span>
                </span>
              ) : null}
            </span>
          </span>
        </article>
      </PostLink>
    </li>
  );
}
