import type { CommentThreadPage, PublicPost } from "@feedbax/feedback";
import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";

import {
  PublicPostDetail,
  PublicPostDetailSkeleton,
} from "./public-post-detail";

export function createPublicPostRoute({
  loadPost,
  loadComments,
  renderUnavailable,
}: {
  loadPost: (slug: string) => Promise<PublicPost | undefined>;
  loadComments?: (slug: string, cursor?: string) => Promise<CommentThreadPage>;
  renderUnavailable: (slug: string) => ReactNode;
}) {
  const route = createFileRoute("/p/$slug")({
    loader: async ({ params }) => {
      const post = await loadPost(params.slug);
      const comments =
        post && loadComments ? await loadComments(params.slug) : { items: [] };
      return { post, comments };
    },
    component: PostRoute,
    pendingComponent: PublicPostDetailSkeleton,
  });

  function PostRoute() {
    const data = route.useLoaderData();
    const { slug } = route.useParams();
    const [comments, setComments] = useState(data.comments);
    return data.post ? (
      <PublicPostDetail
        post={data.post}
        comments={comments}
        loadMore={
          loadComments && comments.nextCursor
            ? async () => {
                const next = await loadComments(slug, comments.nextCursor);
                setComments({
                  items: mergeCommentThreads(comments.items, next.items),
                  ...(next.nextCursor ? { nextCursor: next.nextCursor } : {}),
                });
              }
            : undefined
        }
      />
    ) : (
      renderUnavailable(slug)
    );
  }

  return route;
}

function mergeCommentThreads(
  current: CommentThreadPage["items"],
  next: CommentThreadPage["items"],
): CommentThreadPage["items"] {
  const merged = new Map(current.map((thread) => [thread.id, thread]));
  for (const thread of next) {
    const existing = merged.get(thread.id);
    merged.set(
      thread.id,
      existing
        ? { ...existing, comments: [...existing.comments, ...thread.comments] }
        : thread,
    );
  }
  return [...merged.values()];
}
