import { createPublicPostRoute } from "../public-post-route";
import { PublicPortalError } from "../public-portal-error";
import { getPublicPost } from "../public-post-server-function";
import { AuthorizedDraftPost } from "../authorized-draft-post";

export const Route = createPublicPostRoute({
  loadPost: (slug) => getPublicPost({ data: { slug } }),
  renderUnavailable: (slug) => <AuthorizedDraftPost slug={slug} />,
}).update({
  errorComponent: PublicPortalError,
});
