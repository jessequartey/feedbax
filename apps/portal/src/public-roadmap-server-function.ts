import { roadmapStatuses, type RoadmapStatus } from "@feedbax/feedback";
import { createServerFn } from "@tanstack/react-start";

import { createConfiguredFeedbackModule } from "./feedback-runtime";
import {
  loadPublicRoadmapPage,
  loadPublicRoadmapStatusPage,
} from "./public-roadmap-page";
import { runSafePublicRead } from "./safe-public-failure";

const roadmapStatusSet = new Set<string>(roadmapStatuses);

export const getPublicRoadmapPage = createServerFn({ method: "GET" }).handler(
  () =>
    runSafePublicRead(() =>
      loadPublicRoadmapPage({
        feedback: createConfiguredFeedbackModule(),
      }),
    ),
);

export const getPublicRoadmapStatusPage = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    if (!input || typeof input !== "object")
      throw new Error("Roadmap request is invalid.");
    const status = Reflect.get(input, "status");
    const cursor = Reflect.get(input, "cursor");
    if (typeof status !== "string" || !roadmapStatusSet.has(status))
      throw new Error("Roadmap request is invalid.");
    if (cursor !== undefined && typeof cursor !== "string")
      throw new Error("Roadmap request is invalid.");
    return {
      status: status as RoadmapStatus,
      ...(cursor ? { cursor } : {}),
    };
  })
  .handler(({ data }) =>
    runSafePublicRead(() =>
      loadPublicRoadmapStatusPage({
        feedback: createConfiguredFeedbackModule(),
        query: data,
      }),
    ),
  );
