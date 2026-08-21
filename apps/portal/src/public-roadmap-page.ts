import type { FeedbackModule, PublicPostRoadmap } from "@feedbax/feedback";

export function loadPublicRoadmapPage({
  feedback,
}: {
  feedback: Pick<FeedbackModule, "getPublicPostRoadmap">;
}): Promise<PublicPostRoadmap> {
  return feedback.getPublicPostRoadmap();
}
