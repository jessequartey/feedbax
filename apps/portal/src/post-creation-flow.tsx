import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import {
  PortalFeedbackForm,
  type PortalFeedbackMutations,
} from "./portal-feedback-form";
import { authorizedDraftPostsQueryKey } from "./authorized-draft-query";
import { readCapabilities } from "./browser-post-state";

export function PostCreationFlow({
  display = "page",
  onCancel,
  mutations,
}: {
  display?: "page" | "overlay";
  onCancel?: () => void;
  mutations: PortalFeedbackMutations;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  return (
    <PortalFeedbackForm
      display={display}
      onCancel={onCancel}
      mutations={mutations}
      onCreated={async (post) => {
        const draft = {
          id: post.id,
          slug: post.slug,
          title: post.title,
          description: post.description,
          type: post.type,
          status: post.status,
          createdAt: post.createdAt,
          updatedAt: post.updatedAt,
        };
        queryClient.setQueryData(
          authorizedDraftPostsQueryKey(readCapabilities(localStorage)),
          (current: (typeof draft)[] | undefined) => [
            draft,
            ...(current ?? []).filter((item) => item.id !== draft.id),
          ],
        );
        await queryClient.invalidateQueries({ queryKey: ["public-posts"] });
        await navigate({ to: "/p/$slug", params: { slug: post.slug } });
      }}
    />
  );
}
