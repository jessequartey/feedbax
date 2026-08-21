import { createFileRoute } from "@tanstack/react-router";
import { PublicPostDetail } from "../public-post-detail";
import { PublicPortalError } from "../public-portal-error";
import { getPublicPost } from "../public-post-server-function";
import { AuthorizedDraftPost } from "../authorized-draft-post";

export const Route = createFileRoute("/p/$slug")({
  loader: async ({ params }) => {
    const post = await getPublicPost({ data: params });
    return post;
  },
  component: PostRoute,
  errorComponent: PublicPortalError,
});

function PostRoute() {
  const post = Route.useLoaderData();
  return post ? (
    <PublicPostDetail post={post} />
  ) : (
    <AuthorizedDraftPost slug={Route.useParams().slug} />
  );
}
