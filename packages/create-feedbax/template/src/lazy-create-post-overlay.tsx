import { CreatePostOverlay } from "./create-post-overlay";
import { portalFeedbackMutations } from "./routed-post-creation-form";

export function LazyCreatePostOverlay() {
  return <CreatePostOverlay mutations={portalFeedbackMutations} />;
}
