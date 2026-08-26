import { createServerFn } from "@tanstack/react-start";

import { createConfiguredFeedbackModule } from "./feedback-runtime";
import { loadPublicPostPage, publicPostSearch } from "./public-feedback-page";
import { runSafePublicRead } from "./safe-public-failure";

export const getPublicPostPage = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    publicPostSearch(
      typeof input === "object" && input !== null
        ? (input as Record<string, unknown>)
        : {},
    ),
  )
  .handler(({ data }) =>
    runSafePublicRead(() =>
      loadPublicPostPage({
        feedback: createConfiguredFeedbackModule(),
        search: data,
      }),
    ),
  );
