import { createFeedbackModule } from "@feedbax/feedback";
import { describe, expect, it } from "vitest";
import { loadPublicPost, postPath } from "./public-post-page";

describe("canonical Post page", () => {
  it("uses only the immutable slug as public identity", async () => {
    const feedback = createFeedbackModule({
      initialItems: [
        {
          id: "secret-id",
          slug: "clean-post",
          title: "Clean Post",
          description: "Body",
          type: "Feature Request",
          status: "New",
          published: true,
          createdAt: new Date("2026-01-01"),
          updatedAt: new Date("2026-01-01"),
        },
      ],
    });
    const post = await loadPublicPost({ feedback, slug: "clean-post" });
    expect(postPath(post!)).toBe("/p/clean-post");
    expect(post).not.toHaveProperty("id");
  });
});
