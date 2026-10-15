import type { CommentThreadPage, PublicPost } from "@feedbax/feedback";
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { type ReactNode } from "react";
import type { PortalCommentRequest } from "./portal-comments";
import { PostDetailContent } from "./post-detail-content";
import feedbax from "./feedbax";
import { createRouteHead } from "./portal-head";

import { PublicPostDetailSkeleton } from "./public-post-detail-skeleton";
import { publicPostQuery } from "./post-detail-query";

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
    loader: async ({ params, context }) => {
      const post = await context.queryClient.ensureQueryData(
        publicPostQuery(params.slug, loadPost),
      );
      return { post };
    },
    head: ({ loaderData, params }) =>
      loaderData?.post
        ? createRouteHead(feedbax.product, {
            title: loaderData.post.title,
            description: loaderData.post.description,
            path: `/p/${encodeURIComponent(loaderData.post.slug)}`,
          })
        : createRouteHead(feedbax.product, {
            title: "Post unavailable",
            description: feedbax.product.description,
            path: `/p/${encodeURIComponent(params.slug)}`,
            noIndex: true,
          }),
    component: PostRoute,
    pendingComponent: PublicPostDetailSkeleton,
  });

  function PostRoute() {
    const { slug } = route.useParams();
    const { data: post } = useSuspenseQuery(publicPostQuery(slug, loadPost));
    return post ? (
      <PostDetailContent
        post={post}
        loadComments={loadComments}
        submitComment={submitPublicComment}
        mutateComment={mutatePublicComment}
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
  const commentCapability = Reflect.get(result, "commentCapability");
  const commentCapabilityExpiresAt = Reflect.get(
    result,
    "commentCapabilityExpiresAt",
  );
  return {
    ...comment,
    createdAt,
    ...(typeof commentCapability === "string" &&
    typeof commentCapabilityExpiresAt === "number"
      ? { commentCapability, commentCapabilityExpiresAt }
      : {}),
  } as import("./public-post-detail").ConfirmedPortalComment;
}

export async function mutatePublicComment(input: {
  action: "edit" | "delete";
  commentId: string;
  commentCapability: string;
  body?: string;
}) {
  const participationPass = sessionStorage.getItem(
    "feedbax:participation-pass",
  );
  const response = await fetch("/internal/comments", {
    method: input.action === "edit" ? "PATCH" : "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...input,
      ...(participationPass ? { participationPass } : {}),
    }),
  });
  const result: unknown = await response.json();
  if (!response.ok) {
    const code =
      result && typeof result === "object"
        ? Reflect.get(result, "code")
        : undefined;
    if (code === "verification_required")
      sessionStorage.removeItem("feedbax:participation-pass");
    const message =
      result &&
      typeof result === "object" &&
      typeof Reflect.get(result, "error") === "string"
        ? Reflect.get(result, "error")
        : "Comment could not be changed. Try again.";
    throw new Error(message as string);
  }
  return result;
}
