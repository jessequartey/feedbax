import { createServerFn } from "@tanstack/react-start";

import { createConfiguredFeedbackModule } from "./feedback-runtime";
import { loadPublicPost } from "./public-post-page";
import { runSafePublicRead } from "./safe-public-failure";

export const getPublicPost = createServerFn({ method: "GET" })
  .validator((input: unknown) => {
    const slug =
      input && typeof input === "object"
        ? Reflect.get(input, "slug")
        : undefined;
    if (typeof slug !== "string" || !slug)
      throw new Error("Post route is invalid.");
    return { slug };
  })
  .handler(({ data }) =>
    runSafePublicRead(() =>
      loadPublicPost({
        feedback: createConfiguredFeedbackModule(),
        slug: data.slug,
      }),
    ),
  );
