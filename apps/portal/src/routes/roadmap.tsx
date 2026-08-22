import { createPublicRoadmapRoute } from "../public-roadmap-route";
import { getPublicRoadmapPage } from "../public-roadmap-server-function";

export const Route = createPublicRoadmapRoute({
  fetchRoadmap: () => getPublicRoadmapPage(),
});
