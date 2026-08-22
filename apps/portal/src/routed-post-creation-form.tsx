import {
  editPortalFeedbackDraft,
  submitPortalPost,
  withdrawPortalFeedbackDraft,
} from "./portal-feedback-server-function";
import { PostCreationFlow } from "./post-creation-flow";

const mutations = {
  submitPost: submitPortalPost,
  editDraft: editPortalFeedbackDraft,
  withdrawDraft: withdrawPortalFeedbackDraft,
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
      mutations={mutations}
    />
  );
}
