// @vitest-environment jsdom

import { createFeedbackModule } from "@feedbax/feedback";
import { cleanup, render, screen } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { loadPublicPost } from "./public-post-page";
import { createPublicPostRoute } from "./public-post-route";
import { PublicPostUnavailable } from "./public-post-unavailable";

beforeAll(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
});

afterAll(() => {
  vi.restoreAllMocks();
});

afterEach(cleanup);

describe("/p/$slug", () => {
  it("retrieves and renders a complete Post from its clean canonical URL", async () => {
    const feedback = createFeedbackModule({ initialItems: [publishedPost] });
    const history = createMemoryHistory({
      initialEntries: ["/p/keyboard-first-search"],
    });
    const router = createPostRouter({ feedback, history });

    render(<RouterProvider router={router} />);

    expect(
      await screen.findByRole("heading", { name: "Keyboard-first search" }),
    ).toBeTruthy();
    expect(screen.getByText("Feature Request")).toBeTruthy();
    expect(screen.getByText("Planned")).toBeTruthy();
    expect(screen.getByText("Submitted")).toBeTruthy();
    expect(screen.getByText("Last updated")).toBeTruthy();
    expect(history.location.pathname).toBe("/p/keyboard-first-search");
    expect(document.body.textContent).not.toContain("secret-id");
  });

  it.each(["missing-post", "unpublished-post"])(
    "renders the same safe unavailable state for %s",
    async (slug) => {
      const feedback = createFeedbackModule({
        initialItems: [unpublishedPost],
      });
      const history = createMemoryHistory({
        initialEntries: [`/p/${slug}`],
      });
      const router = createPostRouter({ feedback, history });

      render(<RouterProvider router={router} />);

      expect(
        await screen.findByRole("heading", {
          name: "This Post isn’t available.",
        }),
      ).toBeTruthy();
      expect(document.body.textContent).toContain(
        "It may not exist, or it may not be published yet.",
      );
      expect(document.body.textContent).not.toContain("Private title");
      expect(document.body.textContent).not.toContain("private@example.com");
      expect(document.body.textContent).not.toContain(
        "Private Product Team notes",
      );
    },
  );
});

function createPostRouter({
  feedback,
  history,
}: {
  feedback: ReturnType<typeof createFeedbackModule>;
  history: ReturnType<typeof createMemoryHistory>;
}) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const postRoute = createPublicPostRoute({
    loadPost: (slug) => loadPublicPost({ feedback, slug }),
    renderUnavailable: () => <PublicPostUnavailable />,
  }).update({
    id: "/p/$slug",
    path: "/p/$slug",
    getParentRoute: () => rootRoute,
  } as never);
  return createRouter({
    history,
    routeTree: rootRoute.addChildren([postRoute]),
  });
}

const publishedPost = {
  id: "secret-id",
  slug: "keyboard-first-search",
  title: "Keyboard-first search",
  description: "Open search without reaching for the mouse.",
  type: "Feature Request" as const,
  status: "Planned" as const,
  published: true,
  createdAt: new Date("2026-08-20T10:00:00.000Z"),
  updatedAt: new Date("2026-08-20T12:00:00.000Z"),
};

const unpublishedPost = {
  ...publishedPost,
  id: "private-id",
  slug: "unpublished-post",
  title: "Private title",
  description: "Private description",
  published: false,
  submitter: { email: "private@example.com" },
  pageBody: "Private Product Team notes",
};
