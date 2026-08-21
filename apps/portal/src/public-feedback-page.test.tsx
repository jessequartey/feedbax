import { createFeedbackModule } from "@feedbax/feedback";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PublicFeedbackIndex } from "./public-feedback-index";
import { loadPublicFeedbackPage } from "./public-feedback-page";

describe("public feedback home page", () => {
  it("loads 25 Published Posts and an opaque next-page cursor", async () => {
    const feedback = createFeedbackModule({
      initialItems: Array.from({ length: 26 }, (_, index) => ({
        id: `feedback-${index + 1}`,
        slug: `feedback-${index + 1}`,
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
          slug: "matching-feedback",
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
          slug: "wrong-status",
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
          slug: "wrong-type",
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
      search: { types: ["Feature Request"], statuses: ["Planned"] },
    });

    expect(page.items.map((item) => item.title)).toEqual(["Matching feedback"]);
  });

  it("renders explicit empty state and accessible filters", () => {
    const html = renderToStaticMarkup(
      <PublicFeedbackIndex
        page={{ items: [], nextCursor: "opaque-next-page" }}
        search={{ types: ["Bug Report"], statuses: ["Reviewing"] }}
      />,
    );

    expect(html).toContain("No Posts match this view");
    expect(html).toContain("Post Types");
    expect(html).toContain("Post Statuses");
    expect(html).toContain("Filters (2)");
    expect(html).toContain('checked="" value="Bug Report"');
    expect(html).toContain('checked="" value="Reviewing"');
  });

  it("links each Published Post by immutable slug", () => {
    const html = renderToStaticMarkup(
      <PublicFeedbackIndex
        page={{
          items: [
            {
              slug: "keyboard-first-search",
              title: "Keyboard-first search!",
              description: "Open search without reaching for the mouse.",
              type: "Feature Request",
              status: "Planned",
              createdAt: new Date("2026-08-20T10:00:00.000Z"),
              updatedAt: new Date("2026-08-20T12:00:00.000Z"),
            },
          ],
        }}
        search={{}}
      />,
    );

    expect(html).toContain('href="/p/keyboard-first-search"');
  });
});
