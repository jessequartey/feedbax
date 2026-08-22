import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { PublicPortalError } from "./public-portal-error";
import {
  PublicRoadmapSkeleton,
  PublicRoadmapView,
} from "./public-roadmap-view";
import { publicRoadmapQuery, type FetchPublicRoadmap } from "./roadmap-query";

export function createPublicRoadmapRoute({
  fetchRoadmap,
}: {
  fetchRoadmap: FetchPublicRoadmap;
}) {
  const query = publicRoadmapQuery(fetchRoadmap);
  const route = createFileRoute("/roadmap")({
    loader: ({ context }) => context.queryClient.ensureQueryData(query),
    component: RoadmapComponent,
    pendingComponent: PublicRoadmapSkeleton,
    errorComponent: PublicPortalError,
  });

  function RoadmapComponent() {
    const roadmap = useSuspenseQuery(query).data;
    return <PublicRoadmapView roadmap={roadmap} maskPostLinks />;
  }

  return route;
}
