import { createFeedbackModule } from "@feedbax/feedback";
import { QueryClient } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { loadPublicRoadmapPage } from "./public-roadmap-page";
import { publicRoadmapQuery } from "./roadmap-query";
import {
  PublicRoadmapSkeleton,
  PublicRoadmapView,
} from "./public-roadmap-view";

vi.mock("./public-roadmap-server-function", () => ({
  getPublicRoadmapPage: vi.fn(),
}));

describe("public roadmap page", () => {
  it("loads Published Feedback Items in the agreed roadmap groups and order", async () => {
    const createdAt = new Date("2026-08-01T09:00:00.000Z");
    const feedback = createFeedbackModule({
      initialItems: [
        roadmapItem("planned-older", "Planned earlier", "Planned", createdAt),
        roadmapItem(
          "planned-newer",
          "Planned later",
          "Planned",
          new Date("2026-08-20T09:00:00.000Z"),
        ),
        roadmapItem(
          "in-progress",
          "Building now",
          "In Progress",
          new Date("2026-08-19T09:00:00.000Z"),
        ),
        roadmapItem(
          "shipped",
          "Already shipped",
          "Shipped",
          new Date("2026-08-18T09:00:00.000Z"),
        ),
        {
          ...roadmapItem(
            "private",
            "Private plan",
            "Planned",
            new Date("2026-08-21T09:00:00.000Z"),
          ),
          published: false,
        },
      ],
    });

    const roadmap = await loadPublicRoadmapPage({ feedback });

    expect(roadmap.Planned.map((item) => item.title)).toEqual([
      "Planned later",
      "Planned earlier",
    ]);
    expect(roadmap["In Progress"].map((item) => item.title)).toEqual([
      "Building now",
    ]);
    expect(roadmap.Shipped.map((item) => item.title)).toEqual([
      "Already shipped",
    ]);
  });

  it("renders explicit empty groups", () => {
    const html = renderToStaticMarkup(
      <PublicRoadmapView
        roadmap={{ Planned: [], "In Progress": [], Shipped: [] }}
      />,
    );

    expect(html).toContain("Planned");
    expect(html).toContain("In progress");
    expect(html).toContain("Shipped");
    expect(html.match(/No Posts here yet\./g)).toHaveLength(3);
  });

  it("links roadmap Posts by immutable slug", () => {
    const item = roadmapItem(
      "stable-notion-page-id",
      "Keyboard-first search!",
      "Planned",
      new Date("2026-08-20T09:00:00.000Z"),
    );
    const html = renderToStaticMarkup(
      <PublicRoadmapView
        roadmap={{ Planned: [item], "In Progress": [], Shipped: [] }}
      />,
    );

    expect(html).toContain('href="/p/keyboard-first-search"');
  });

  it("renders three roadmap skeleton columns while the route is loading", () => {
    const html = renderToStaticMarkup(<PublicRoadmapSkeleton />);

    expect(html).toContain('aria-label="Loading roadmap"');
    expect(html.match(/data-roadmap-skeleton-column/g)).toHaveLength(3);
    expect(html).toContain("See where feedback is heading.");
  });

  it("reuses the roadmap loaded into the Query cache", async () => {
    const roadmap = { Planned: [], "In Progress": [], Shipped: [] };
    const fetchRoadmap = vi.fn(async () => roadmap);
    const queryClient = new QueryClient();
    const options = publicRoadmapQuery(fetchRoadmap);

    await queryClient.ensureQueryData(options);
    await queryClient.ensureQueryData(options);

    expect(fetchRoadmap).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(options.queryKey)).toEqual(roadmap);
  });
});

function roadmapItem(
  id: string,
  title: string,
  status: "Planned" | "In Progress" | "Shipped",
  updatedAt: Date,
) {
  return {
    id,
    slug: title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-$/, ""),
    title,
    description: `${title} description`,
    type: "Feature Request" as const,
    status,
    published: true,
    createdAt: new Date("2026-08-01T09:00:00.000Z"),
    updatedAt,
  };
}
