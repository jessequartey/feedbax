// @vitest-environment jsdom

import {
  createFeedbackModule,
  type CommentThreadPage,
} from "@feedbax/feedback";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
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
    const feedback = createFeedbackModule({
      initialItems: [publishedPost],
      initialComments: [
        {
          id: "comment-1",
          postId: "secret-id",
          discussionId: "discussion-1",
          body: "Please add Vim bindings.",
          author: { kind: "participant", displayName: "Ari" },
          createdAt: new Date("2026-08-20T13:00:00.000Z"),
          resolved: false,
        },
      ],
    });
    const history = createMemoryHistory({
      initialEntries: ["/p/keyboard-first-search"],
    });
    const router = createPostRouter({ feedback, history });

    render(<RouterProvider router={router} />);

    expect(
      await screen.findByRole("heading", { name: "Keyboard-first search" }),
    ).toBeTruthy();
    const details = within(
      screen.getByRole("complementary", { name: "Details" }),
    );
    expect(details.getByText("Feature Request")).toBeTruthy();
    expect(details.getByText("Planned")).toBeTruthy();
    expect(details.getByText("Submitted")).toBeTruthy();
    expect(details.getByText("Updated")).toBeTruthy();
    expect(history.location.pathname).toBe("/p/keyboard-first-search");
    expect(screen.getByText("Please add Vim bindings.")).toBeTruthy();
    expect(screen.getByText("Ari")).toBeTruthy();
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

  it("loads and merges the next stable Comment page only after Load more", async () => {
    const feedback = createFeedbackModule({ initialItems: [publishedPost] });
    const loadComments = vi
      .fn()
      .mockResolvedValueOnce({
        items: [
          {
            id: "discussion-1",
            comments: [
              {
                id: "comment-1",
                body: "First page",
                author: { kind: "participant", displayName: "Ari" },
                createdAt: new Date("2026-08-20T13:00:00.000Z"),
              },
            ],
          },
        ],
        nextCursor: "native-cursor",
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: "discussion-1",
            comments: [
              {
                id: "comment-2",
                body: "Second page",
                author: { kind: "product-team", displayName: "Product Team" },
                createdAt: new Date("2026-08-20T14:00:00.000Z"),
              },
            ],
          },
        ],
      });
    const history = createMemoryHistory({
      initialEntries: ["/p/keyboard-first-search"],
    });
    const router = createPostRouter({ feedback, history, loadComments });
    render(<RouterProvider router={router} />);

    expect(await screen.findByText("First page")).toBeTruthy();
    expect(loadComments).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Second page")).toBeTruthy();
    expect(screen.getByText("First page")).toBeTruthy();
    expect(loadComments).toHaveBeenLastCalledWith(
      "keyboard-first-search",
      "native-cursor",
    );
  });
});

function createPostRouter({
  feedback,
  history,
  loadComments,
}: {
  feedback: ReturnType<typeof createFeedbackModule>;
  history: ReturnType<typeof createMemoryHistory>;
  loadComments?: (slug: string, cursor?: string) => Promise<CommentThreadPage>;
}) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const postRoute = createPublicPostRoute({
    loadPost: (slug) => loadPublicPost({ feedback, slug }),
    loadComments:
      loadComments ??
      ((slug, cursor) => feedback.listCommentThreads({ slug, cursor })),
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
