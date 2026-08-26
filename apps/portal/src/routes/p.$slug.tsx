import { createPublicPostRoute } from "../public-post-route";
import { PublicPortalError } from "../public-portal-error";
import {
  getPublicPost,
  getPublicPostComments,
} from "../public-post-server-function";
import { AuthorizedDraftPost } from "../authorized-draft-post";

export const Route = createPublicPostRoute({
  loadPost: (slug) => getPublicPost({ data: { slug } }),
  loadComments: (slug, cursor) =>
    getPublicPostComments({ data: { slug, cursor } }),
  renderUnavailable: (slug) => <AuthorizedDraftPost slug={slug} />,
}).update({
  errorComponent: PublicPortalError,
});
