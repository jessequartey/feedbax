import type {
  PublicPostRoadmap,
  PublicRoadmapPage,
  PublicRoadmapQuery,
} from "@feedbax/feedback";
import { queryOptions } from "@tanstack/react-query";

export type FetchPublicRoadmap = () => Promise<PublicPostRoadmap>;
export type FetchPublicRoadmapStatusPage = (
  query: PublicRoadmapQuery,
) => Promise<PublicRoadmapPage>;

export const publicRoadmapQueryKey = ["public-post-roadmap"] as const;

export function publicRoadmapQuery(fetchRoadmap: FetchPublicRoadmap) {
  return queryOptions({
    queryKey: publicRoadmapQueryKey,
    queryFn: fetchRoadmap,
    staleTime: 30_000,
  });
}
