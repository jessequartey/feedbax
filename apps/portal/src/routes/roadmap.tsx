import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";

import { PublicPortalError } from "../public-portal-error";
import {
  PublicRoadmapSkeleton,
  PublicRoadmapView,
} from "../public-roadmap-view";
import { publicRoadmapQuery } from "../roadmap-query";

export const Route = createFileRoute("/roadmap")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(publicRoadmapQuery()),
  component: RoadmapComponent,
  pendingComponent: PublicRoadmapSkeleton,
  errorComponent: PublicPortalError,
});

function RoadmapComponent() {
  const roadmap = useSuspenseQuery(publicRoadmapQuery()).data;
  return <PublicRoadmapView roadmap={roadmap} maskPostLinks />;
}
