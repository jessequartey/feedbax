import { OverlayPostDetail } from "./overlay-post-detail";
import { PostDetailOverlay } from "./post-detail-overlay";

export function LazyPostDetailOverlay() {
  return (
    <PostDetailOverlay
      renderDetail={(slug) => <OverlayPostDetail slug={slug} />}
    />
  );
}
