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

export function publicRoadmapQuery(fetchRoadmap: FetchPublicRoadmap) {
  return queryOptions({
    queryKey: ["public-post-roadmap"] as const,
    queryFn: fetchRoadmap,
    staleTime: 30_000,
  });
}
