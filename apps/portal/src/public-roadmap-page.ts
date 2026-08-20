import type { FeedbackModule, PublicRoadmap } from "@feedbax/feedback";

export function loadPublicRoadmapPage({
  feedback,
}: {
  feedback: Pick<FeedbackModule, "getPublicRoadmap">;
}): Promise<PublicRoadmap> {
  return feedback.getPublicRoadmap();
}
