import type { PublicPostRoadmap } from "@feedbax/feedback";
import { queryOptions } from "@tanstack/react-query";

import { getPublicRoadmapPage } from "./public-roadmap-server-function";

type FetchPublicRoadmap = () => Promise<PublicPostRoadmap>;

const fetchPublicRoadmap: FetchPublicRoadmap = () => getPublicRoadmapPage();

export function publicRoadmapQuery(
  fetchRoadmap: FetchPublicRoadmap = fetchPublicRoadmap,
) {
  return queryOptions({
    queryKey: ["public-post-roadmap"] as const,
    queryFn: fetchRoadmap,
    staleTime: 30_000,
  });
}
