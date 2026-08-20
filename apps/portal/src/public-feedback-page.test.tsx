import { createFeedbackModule } from "@feedbax/feedback";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PublicFeedbackIndex } from "./public-feedback-index";
import { loadPublicFeedbackPage } from "./public-feedback-page";

describe("public feedback home page", () => {
  it("loads the newest 25 Published Feedback Items and an opaque next-page cursor", async () => {
    const feedback = createFeedbackModule({
      initialItems: Array.from({ length: 26 }, (_, index) => ({
        id: `feedback-${index + 1}`,
        title: `Feedback ${index + 1}`,
        description: `Description ${index + 1}`,
        type: "Feature Request" as const,
        status: "New" as const,
        published: true,
        createdAt: new Date(Date.UTC(2026, 6, index + 1)),
        updatedAt: new Date(Date.UTC(2026, 6, index + 1)),
      })),
    });

    const page = await loadPublicFeedbackPage({
      feedback,
      search: {},
    });

    expect(page.items).toHaveLength(25);
    expect(page.items.map((item) => item.title)).toEqual([
      "Feedback 26",
      ...Array.from({ length: 24 }, (_, index) => `Feedback ${25 - index}`),
    ]);
    expect(page.nextCursor).toEqual(expect.any(String));
    expect(page.nextCursor).not.toContain("feedback-");
  });

  it("applies Feedback Type and Feedback Status filters from the page URL", async () => {
    const feedback = createFeedbackModule({
      initialItems: [
        {
          id: "matching-feedback",
          title: "Matching feedback",
          description: "A planned feature request.",
          type: "Feature Request",
          status: "Planned",
          published: true,
          createdAt: new Date("2026-08-20T10:00:00.000Z"),
          updatedAt: new Date("2026-08-20T10:00:00.000Z"),
        },
        {
          id: "wrong-status",
          title: "New feature request",
          description: "This should be filtered out.",
          type: "Feature Request",
          status: "New",
          published: true,
          createdAt: new Date("2026-08-19T10:00:00.000Z"),
          updatedAt: new Date("2026-08-19T10:00:00.000Z"),
        },
        {
          id: "wrong-type",
          title: "Planned bug report",
          description: "This should also be filtered out.",
          type: "Bug Report",
          status: "Planned",
          published: true,
          createdAt: new Date("2026-08-18T10:00:00.000Z"),
          updatedAt: new Date("2026-08-18T10:00:00.000Z"),
        },
      ],
    });

    const page = await loadPublicFeedbackPage({
      feedback,
      search: { type: "Feature Request", status: "Planned" },
    });

    expect(page.items.map((item) => item.title)).toEqual(["Matching feedback"]);
  });

  it("renders explicit empty state and accessible filters", () => {
    const html = renderToStaticMarkup(
      <PublicFeedbackIndex
        page={{ items: [], nextCursor: "opaque-next-page" }}
        search={{ type: "Bug Report", status: "Reviewing" }}
      />,
    );

    expect(html).toContain("No feedback matches these filters");
    expect(html).toContain('aria-label="Feedback Type"');
    expect(html).toContain('aria-label="Feedback Status"');
    expect(html).toContain("cursor=opaque-next-page");
    expect(html).toContain("type=Bug+Report");
    expect(html).toContain("status=Reviewing");
  });
});
