import {
  editPortalFeedbackDraft,
  submitPortalPost,
  withdrawPortalFeedbackDraft,
} from "./portal-feedback-server-function";
import { PostCreationFlow } from "./post-creation-flow";

export const portalFeedbackMutations = {
  submitPost: submitPortalPost,
  editDraftPost: editPortalFeedbackDraft,
  withdrawDraftPost: withdrawPortalFeedbackDraft,
};

export function RoutedPostCreationForm({
  display = "page",
  onCancel,
}: {
  display?: "page" | "overlay";
  onCancel?: () => void;
}) {
  return (
    <PostCreationFlow
      display={display}
      onCancel={onCancel}
      mutations={portalFeedbackMutations}
    />
  );
}
