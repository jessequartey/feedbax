// @vitest-environment jsdom

import { createFeedbackModule } from "@feedbax/feedback";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";

import {
  PublicPostFeedSkeleton,
  PublicPostIndex,
} from "./public-feedback-index";
import { loadPublicPostPage } from "./public-feedback-page";
import { authorizedDraftPostsQueryKey } from "./authorized-draft-query";

afterEach(cleanup);

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

    const page = await loadPublicPostPage({
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

    const page = await loadPublicPostPage({
      feedback,
      search: { types: ["Feature Request"], statuses: ["Planned"] },
    });

    expect(page.items.map((item) => item.title)).toEqual(["Matching feedback"]);
  });

  it("renders the registry empty state with a clear reset action", () => {
    const html = renderIndex(
      <PublicPostIndex
        page={{ items: [], nextCursor: "opaque-next-page" }}
        search={{ types: ["Bug Report"], statuses: ["Reviewing"] }}
      />,
    );

    expect(html).toContain("No Posts match this view");
    expect(html).toContain("Clear filters");
  });

  it("renders the feedback workspace described by the visual brief", () => {
    const html = renderIndex(
      <PublicPostIndex page={{ items: [publishedPost] }} search={{}} />,
    );

    expect(html).toContain("Share ideas and vote on what matters.");
    expect(html).toContain("Boards");
    expect(html).toContain("All posts");
    expect(html).toContain("Status");
    expect(html).toContain("Trending");
    expect(html).toContain("Top");
    expect(html).toContain("New post");
  });

  it("renders scan-friendly Post cards with honest placeholder counts", () => {
    renderIndexIntoDocument(
      <PublicPostIndex page={{ items: [publishedPost] }} search={{}} />,
    );

    const post = screen.getByRole("link", { name: /Keyboard-first search!/ });
    expect(within(post).getByText("Feature Request")).toBeTruthy();
    expect(within(post).getByText("Planned")).toBeTruthy();
    expect(within(post).getByLabelText("Score unavailable")).toBeTruthy();
    expect(within(post).getByLabelText("Comments unavailable")).toBeTruthy();
    expect(within(post).getAllByText("—")).toHaveLength(2);
  });

  it("links each Published Post by immutable slug", () => {
    const html = renderIndex(
      <PublicPostIndex
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

  it("keeps visible Posts and offers retry when Load More fails", () => {
    const html = renderIndex(
      <PublicPostIndex
        page={{ items: [publishedPost], nextCursor: "opaque-next-page" }}
        search={{}}
        loadMore={() => undefined}
        loadMoreError
      />,
    );

    expect(html).toContain("Keyboard-first search!");
    expect(html).toContain("Couldn’t load more Posts");
    expect(html).toContain("Try again");
  });

  it("renders a contextual feed skeleton while the route is loading", () => {
    const html = renderToStaticMarkup(<PublicPostFeedSkeleton />);

    expect(html).toContain('aria-label="Loading Posts"');
    expect(html).toContain('aria-busy="true"');
    expect(html.match(/data-post-skeleton-row/g)).toHaveLength(3);
    expect(html).toContain("Loading Posts…");
  });

  it("pins recognizable matching Draft Posts above Published Posts", () => {
    const draft = {
      id: "draft-id",
      slug: "keyboard-draft",
      title: "Keyboard draft",
      description: "Keyboard access still being drafted.",
      type: "Feature Request" as const,
      status: "New" as const,
      submitter: {},
      createdAt: new Date("2026-08-22T10:00:00.000Z"),
      updatedAt: new Date("2026-08-22T10:00:00.000Z"),
    };
    const html = renderIndex(
      <PublicPostIndex
        page={{ items: [publishedPost] }}
        search={{ search: "keyboard", types: ["Feature Request"] }}
      />,
      [draft],
    );

    expect(html.indexOf("Keyboard draft")).toBeLessThan(
      html.indexOf("Keyboard-first search!"),
    );
    expect(html.match(/<ol class="divide-y/g)).toHaveLength(1);
    expect(html).toContain("draft-post-link");
    expect(html).toContain(">Draft</span>");
  });
});

function renderIndex(
  element: React.ReactElement,
  drafts: unknown[] = [],
): string {
  return renderToStaticMarkup(withIndexQueryClient(element, drafts));
}

function renderIndexIntoDocument(element: React.ReactElement) {
  render(withIndexQueryClient(element));
}

function withIndexQueryClient(
  element: React.ReactElement,
  drafts: unknown[] = [],
) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(authorizedDraftPostsQueryKey({}), drafts);
  return (
    <QueryClientProvider client={queryClient}>{element}</QueryClientProvider>
  );
}

const publishedPost = {
  slug: "keyboard-first-search",
  title: "Keyboard-first search!",
  description: "Open search without reaching for the mouse.",
  type: "Feature Request" as const,
  status: "Planned" as const,
  createdAt: new Date("2026-08-20T10:00:00.000Z"),
  updatedAt: new Date("2026-08-20T12:00:00.000Z"),
};
