import { createServerFn } from "@tanstack/react-start";

import { createConfiguredFeedbackModule } from "./feedback-runtime";
import {
  loadPublicFeedbackPage,
  publicFeedbackSearch,
} from "./public-feedback-page";

export const getPublicFeedbackPage = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    publicFeedbackSearch(
      typeof input === "object" && input !== null
        ? (input as Record<string, unknown>)
        : {},
    ),
  )
  .handler(({ data }) =>
    loadPublicFeedbackPage({
      feedback: createConfiguredFeedbackModule(),
      search: data,
    }),
  );
