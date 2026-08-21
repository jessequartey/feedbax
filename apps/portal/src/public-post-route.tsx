import type { PublicPost } from "@feedbax/feedback";
import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { PublicPostDetail } from "./public-post-detail";

export function createPublicPostRoute({
  loadPost,
  renderUnavailable,
}: {
  loadPost: (slug: string) => Promise<PublicPost | undefined>;
  renderUnavailable: (slug: string) => ReactNode;
}) {
  const route = createFileRoute("/p/$slug")({
    loader: ({ params }) => loadPost(params.slug),
    component: PostRoute,
  });

  function PostRoute() {
    const post = route.useLoaderData();
    const { slug } = route.useParams();
    return post ? <PublicPostDetail post={post} /> : renderUnavailable(slug);
  }

  return route;
}
