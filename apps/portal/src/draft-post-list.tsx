import type { PublicPostQuery } from "@feedbax/feedback";
import { useQuery } from "@tanstack/react-query";
import { readCapabilities } from "./browser-post-state";
import { authorizedDraftPostsQuery } from "./authorized-draft-query";

const fetchAuthorizedDraft = async (
  input: Parameters<
    typeof import("./portal-feedback-server-function").getPortalDraftPost
  >[0],
) => {
  const { getPortalDraftPost } =
    await import("./portal-feedback-server-function");
  return getPortalDraftPost(input);
};

export function useAuthorizedDraftPosts(search: PublicPostQuery) {
  const browser = typeof window !== "undefined";
  const capabilities = browser ? readCapabilities(window.localStorage) : {};
  const draftQuery = useQuery({
    ...authorizedDraftPostsQuery(
      capabilities,
      fetchAuthorizedDraft,
      browser ? window.localStorage : undefined,
    ),
    enabled: browser && Object.keys(capabilities).length > 0,
  });
  const drafts = draftQuery.data ?? [];
  const searchQuery = search.search?.toLocaleLowerCase();
  const visible = drafts.filter(
    (post) =>
      (!searchQuery ||
        `${post.title}\n${post.description}`
          .toLocaleLowerCase()
          .includes(searchQuery)) &&
      (!search.types?.length || search.types.includes(post.type)) &&
      (!search.statuses?.length || search.statuses.includes(post.status)),
  );
  return visible;
}
