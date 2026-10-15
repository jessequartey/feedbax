import { lazy, Suspense } from "react";
import { PostDetailOverlay } from "./post-detail-overlay";
import { PublicPostDetailSkeleton } from "./public-post-detail-skeleton";

const OverlayPostDetail = lazy(() =>
  import("./overlay-post-detail").then((module) => ({
    default: module.OverlayPostDetail,
  })),
);

export function LazyPostDetailOverlay() {
  return (
    <PostDetailOverlay
      renderDetail={(slug) => (
        <Suspense fallback={<PublicPostDetailSkeleton display="overlay" />}>
          <OverlayPostDetail key={slug} slug={slug} />
        </Suspense>
      )}
    />
  );
}
