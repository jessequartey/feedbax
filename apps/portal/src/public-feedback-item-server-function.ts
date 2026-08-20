import { createServerFn } from "@tanstack/react-start";

import { createConfiguredFeedbackModule } from "./feedback-runtime";
import { loadPublicFeedbackItem } from "./public-feedback-item-page";
import { runSafePublicRead } from "./safe-public-failure";

export const getPublicFeedbackItem = createServerFn({ method: "GET" })
  .validator(publicFeedbackItemParams)
  .handler(({ data }) =>
    runSafePublicRead(() =>
      loadPublicFeedbackItem({
        feedback: createConfiguredFeedbackModule(),
        ...data,
      }),
    ),
  );

function publicFeedbackItemParams(input: unknown): {
  id: string;
  slug: string;
} {
  if (
    typeof input !== "object" ||
    input === null ||
    !("id" in input) ||
    !("slug" in input) ||
    typeof input.id !== "string" ||
    typeof input.slug !== "string" ||
    input.id.length === 0 ||
    input.slug.length === 0
  ) {
    throw new Error("Feedback Item route is invalid.");
  }

  return { id: input.id, slug: input.slug };
}
