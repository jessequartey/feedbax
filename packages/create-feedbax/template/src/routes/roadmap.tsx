import { createPublicRoadmapRoute } from "../public-roadmap-route";
import {
  getPublicRoadmapPage,
  getPublicRoadmapStatusPage,
} from "../public-roadmap-server-function";

export const Route = createPublicRoadmapRoute({
  fetchRoadmap: () => getPublicRoadmapPage(),
  fetchRoadmapStatusPage: (query) =>
    getPublicRoadmapStatusPage({ data: query }),
});
