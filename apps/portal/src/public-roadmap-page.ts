import type {
  FeedbackModule,
  PublicPostRoadmap,
  PublicRoadmapPage,
  PublicRoadmapQuery,
} from "@feedbax/feedback";

export function loadPublicRoadmapPage({
  feedback,
}: {
  feedback: Pick<FeedbackModule, "getPublicPostRoadmap">;
}): Promise<PublicPostRoadmap> {
  return feedback.getPublicPostRoadmap();
}

export function loadPublicRoadmapStatusPage({
  feedback,
  query,
}: {
  feedback: Pick<FeedbackModule, "listPublicRoadmapPosts">;
  query: PublicRoadmapQuery;
}): Promise<PublicRoadmapPage> {
  return feedback.listPublicRoadmapPosts(query);
}
