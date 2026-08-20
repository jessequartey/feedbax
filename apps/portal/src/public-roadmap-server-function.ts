import { createServerFn } from "@tanstack/react-start";

import { createConfiguredFeedbackModule } from "./feedback-runtime";
import { loadPublicRoadmapPage } from "./public-roadmap-page";

export const getPublicRoadmapPage = createServerFn({ method: "GET" }).handler(
  () =>
    loadPublicRoadmapPage({
      feedback: createConfiguredFeedbackModule(),
    }),
);
