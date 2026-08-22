import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Skeleton } from "@feedbax/ui/components/skeleton";

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

export function PostCreationSkeleton() {
  return (
    <main
      className="feedback-index submission-page"
      aria-label="Loading Post creation"
      aria-busy="true"
    >
      <section className="feedback-submit creation-skeleton" aria-hidden="true">
        <div className="feedback-submit-copy">
          <Skeleton className="creation-skeleton-eyebrow" />
          <Skeleton className="creation-skeleton-heading" />
          <Skeleton className="creation-skeleton-copy" />
        </div>
        <div className="feedback-submit-form">
          <Skeleton className="creation-skeleton-field" />
          <Skeleton className="creation-skeleton-textarea" />
          <Skeleton className="creation-skeleton-field" />
          <Skeleton className="creation-skeleton-action" />
        </div>
      </section>
      <span className="sr-only">Loading Post creation…</span>
    </main>
  );
}
