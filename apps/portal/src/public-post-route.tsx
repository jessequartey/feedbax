import type { CommentThreadPage, PublicPost } from "@feedbax/feedback";
import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import type { PortalCommentRequest } from "./portal-comments";

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
        submitComment={submitPublicComment}
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

export async function submitPublicComment(input: PortalCommentRequest) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let response: Response;
  try {
    response = await fetch("/internal/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(input),
    });
  } catch (error) {
    throw error instanceof DOMException && error.name === "AbortError"
      ? new Error("Comment timed out. Check your connection and try again.")
      : error;
  } finally {
    clearTimeout(timeout);
  }
  const result: unknown = await response.json();
  if (!response.ok) {
    const code =
      result && typeof result === "object"
        ? Reflect.get(result, "code")
        : undefined;
    if (code === "verification_required" || code === "verification_failed")
      sessionStorage.removeItem("feedbax:participation-pass");
    const message =
      result &&
      typeof result === "object" &&
      typeof Reflect.get(result, "error") === "string"
        ? Reflect.get(result, "error")
        : "Comment could not be saved. Try again.";
    throw new Error(message as string);
  }
  if (!result || typeof result !== "object" || !Reflect.get(result, "comment"))
    throw new Error("Comment could not be confirmed. Try again.");
  const participationPass = Reflect.get(result, "participationPass");
  if (typeof participationPass === "string")
    sessionStorage.setItem("feedbax:participation-pass", participationPass);
  const comment = Reflect.get(result, "comment");
  if (!comment || typeof comment !== "object")
    throw new Error("Comment could not be confirmed. Try again.");
  const createdAt = new Date(String(Reflect.get(comment, "createdAt")));
  if (Number.isNaN(createdAt.getTime()))
    throw new Error("Comment could not be confirmed. Try again.");
  return {
    ...comment,
    createdAt,
  } as import("@feedbax/feedback").CreatedComment;
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
