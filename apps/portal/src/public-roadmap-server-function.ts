import { createServerFn } from "@tanstack/react-start";

import { createConfiguredFeedbackModule } from "./feedback-runtime";
import { loadPublicRoadmapPage } from "./public-roadmap-page";
import { runSafePublicRead } from "./safe-public-failure";

export const getPublicRoadmapPage = createServerFn({ method: "GET" }).handler(
  () =>
    runSafePublicRead(() =>
      loadPublicRoadmapPage({
        feedback: createConfiguredFeedbackModule(),
      }),
    ),
);
