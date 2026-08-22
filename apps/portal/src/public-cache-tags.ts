export const publicFeedbackCacheTag = "feedbax-feedback";
export const publicRoadmapCacheTag = "feedbax-roadmap";

export function publicPostCacheTag(slug: string): string {
  return `feedbax-post-${slug.replace(/[^A-Za-z0-9_.:-]/g, "-")}`;
}
