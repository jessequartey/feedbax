export const publicFeedbackCacheTag = "feedbax-feedback";
export const publicRoadmapCacheTag = "feedbax-roadmap";

export function publicFeedbackItemCacheTag(id: string): string {
  return `feedbax-item-${id.replace(/[^A-Za-z0-9_.:-]/g, "-")}`;
}
