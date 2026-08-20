import { createFeedbackModule } from "@feedbax/feedback";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PublicFeedbackItemDetail } from "./public-feedback-item-detail";
import { loadPublicFeedbackItem } from "./public-feedback-item-page";

describe("public Feedback Item detail page", () => {
  it("loads by stable Feedback Item ID regardless of the cosmetic slug", async () => {
    const feedback = createFeedbackModule({
      initialItems: [
        {
          id: "stable-notion-page-id",
          title: "Keyboard-first search",
          description: "Open search without reaching for the mouse.",
          type: "Feature Request",
          status: "Planned",
          published: true,
          createdAt: new Date("2026-08-20T10:00:00.000Z"),
          updatedAt: new Date("2026-08-20T12:00:00.000Z"),
        },
      ],
    });

    const originalSlug = await loadPublicFeedbackItem({
      feedback,
      id: "stable-notion-page-id",
      slug: "keyboard-first-search",
    });
    const changedSlug = await loadPublicFeedbackItem({
      feedback,
      id: "stable-notion-page-id",
      slug: "this-title-has-changed",
    });

    expect(changedSlug).toEqual(originalSlug);
    expect(changedSlug).toMatchObject({
      id: "stable-notion-page-id",
      title: "Keyboard-first search",
    });
  });

  it("does not expose unpublished or missing Feedback Items", async () => {
    const feedback = createFeedbackModule({
      initialItems: [
        {
          id: "unpublished-item",
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
      loadPublicFeedbackItem({
        feedback,
        id: "unpublished-item",
        slug: "private-title",
      }),
    ).resolves.toBeUndefined();
    await expect(
      loadPublicFeedbackItem({
        feedback,
        id: "missing-item",
        slug: "anything",
      }),
    ).resolves.toBeUndefined();
  });

  it("renders only approved public fields with semantic navigation", () => {
    const html = renderToStaticMarkup(
      <PublicFeedbackItemDetail
        item={{
          id: "stable-notion-page-id",
          title: "Keyboard-first search",
          description: "Open search without reaching for the mouse.",
          type: "Feature Request",
          status: "Planned",
          createdAt: new Date("2026-08-20T10:00:00.000Z"),
          updatedAt: new Date("2026-08-20T12:00:00.000Z"),
        }}
      />,
    );

    expect(html).toContain("Keyboard-first search");
    expect(html).toContain("Open search without reaching for the mouse.");
    expect(html).toContain("Feature Request");
    expect(html).toContain("Planned");
    expect(html).toContain('href="/"');
    expect(html).not.toContain("stable-notion-page-id");
    expect(html).not.toContain("Published");
  });
});
