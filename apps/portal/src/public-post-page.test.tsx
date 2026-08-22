import { createFeedbackModule } from "@feedbax/feedback";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { loadPublicPost, postPath } from "./public-post-page";
import { PublicPostDetailSkeleton } from "./public-post-detail";

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

  it("gives missing and unpublished Posts the same safe unavailable state", async () => {
    const feedback = createFeedbackModule({
      initialItems: [
        {
          id: "private-id",
          slug: "private-post",
          title: "Private title",
          description: "Private description",
          type: "General Feedback",
          status: "Reviewing",
          published: false,
          createdAt: new Date("2026-08-20T10:00:00.000Z"),
          updatedAt: new Date("2026-08-20T12:00:00.000Z"),
          submitter: { email: "private@example.com" },
          pageBody: "Private Product Team notes",
        },
      ],
    });

    await expect(
      loadPublicPost({ feedback, slug: "private-post" }),
    ).resolves.toBeUndefined();
    await expect(
      loadPublicPost({ feedback, slug: "missing-post" }),
    ).resolves.toBeUndefined();
  });

  it("renders a contextual Post detail skeleton", () => {
    const html = renderToStaticMarkup(<PublicPostDetailSkeleton />);

    expect(html).toContain('aria-label="Loading Post details"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading Post details…");
  });
});
