import { createFileRoute } from "@tanstack/react-router";

import { getPublicRoadmapPage } from "../public-roadmap-server-function";
import { PublicPortalError } from "../public-portal-error";
import { PublicRoadmapView } from "../public-roadmap-view";

export const Route = createFileRoute("/roadmap")({
  loader: () => getPublicRoadmapPage(),
  component: RoadmapComponent,
  errorComponent: PublicPortalError,
});

function RoadmapComponent() {
  return <PublicRoadmapView roadmap={Route.useLoaderData()} />;
}
