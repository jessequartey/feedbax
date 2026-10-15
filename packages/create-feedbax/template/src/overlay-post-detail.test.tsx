// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render as renderView,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

import { OverlayPostDetail } from "./overlay-post-detail";
import {
  getPublicPost,
  getPublicPostComments,
} from "./public-post-server-function";
import { saveDeviceProfile } from "./browser-post-state";

vi.mock("./public-post-server-function", () => ({
  getPublicPost: vi.fn(),
  getPublicPostComments: vi.fn().mockResolvedValue({ items: [] }),
}));
vi.mock("./authorized-draft-post", () => ({
  AuthorizedDraftPost: () => <p>Draft fallback</p>,
}));

beforeEach(() => {
  saveDeviceProfile(localStorage, {
    name: "Ari",
    email: "ari@example.com",
  });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

it("shows loading instead of stale content when the requested slug changes", async () => {
  let resolveSecond!: (post: typeof firstPost) => void;
  vi.mocked(getPublicPost)
    .mockResolvedValueOnce(firstPost)
    .mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSecond = resolve;
      }),
    );

  const view = render(<OverlayPostDetail slug="first-post" />);
  expect(
    await screen.findByRole("heading", { name: "First Post" }),
  ).toBeTruthy();

  view.rerender(<OverlayPostDetail slug="second-post" />);
  expect(
    screen
      .getByRole("main", { name: "Loading Post details" })
      .getAttribute("aria-busy"),
  ).toBe("true");
  expect(screen.queryByRole("heading", { name: "First Post" })).toBeNull();

  resolveSecond({ ...firstPost, slug: "second-post", title: "Second Post" });
  expect(
    await screen.findByRole("heading", { name: "Second Post" }),
  ).toBeTruthy();
});

it("shows Post details without the redundant full-page toolbar", async () => {
  vi.mocked(getPublicPost).mockResolvedValue(firstPost);
  vi.mocked(getPublicPostComments).mockResolvedValue({
    items: [
      {
        id: "discussion-1",
        comments: [
          {
            id: "comment-1",
            body: "Visible in the dialog",
            author: { kind: "participant", displayName: "Ari" },
            createdAt: new Date("2026-08-25T01:00:00.000Z"),
          },
        ],
      },
    ],
  });

  render(<OverlayPostDetail slug="first-post" />);

  expect(
    await screen.findByRole("heading", { name: "First Post" }),
  ).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Open full page" })).toBeNull();
  expect(screen.getByRole("complementary", { name: "Details" })).toBeTruthy();
  expect(
    await within(screen.getByRole("region", { name: "Comments" })).findByText(
      "Visible in the dialog",
    ),
  ).toBeTruthy();
  expect(
    await screen.findByRole("form", { name: "Comment composer" }),
  ).toBeTruthy();
  const composer = screen.getByRole("form", { name: "Comment composer" });
  const threads = screen.getByRole("region", { name: "Comment threads" });
  expect(
    composer.compareDocumentPosition(threads) &
      Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    within(threads).queryByRole("form", { name: "Comment composer" }),
  ).toBeNull();
  expect(getPublicPostComments).toHaveBeenCalledWith({
    data: { slug: "first-post" },
  });
  expect(screen.queryByRole("link", { name: "Back to Feedback" })).toBeNull();
});

it("shows the Post while Comments are still loading", async () => {
  vi.mocked(getPublicPost).mockResolvedValue(firstPost);
  let finish!: (page: { items: [] }) => void;
  vi.mocked(getPublicPostComments).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(<OverlayPostDetail slug="first-post" />);
  expect(
    await screen.findByRole("heading", { name: "First Post" }),
  ).toBeTruthy();
  expect(screen.getByRole("status", { name: "Loading Comments" })).toBeTruthy();
  expect(screen.queryByText("No comments yet")).toBeNull();
  finish({ items: [] });
  expect(await screen.findByText("No comments yet")).toBeTruthy();
});

it("keeps the Post available and retries a failed Comment load", async () => {
  vi.mocked(getPublicPost).mockResolvedValue(firstPost);
  vi.mocked(getPublicPostComments).mockRejectedValue(
    new Error("Comments temporarily unavailable"),
  );

  render(<OverlayPostDetail slug="first-post" />);

  expect(
    await screen.findByRole("heading", { name: "First Post" }),
  ).toBeTruthy();
  expect(
    await screen.findByRole("form", { name: "Comment composer" }),
  ).toBeTruthy();
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Comments could not be loaded.",
  );
  expect(screen.queryByText("No comments yet")).toBeNull();
  vi.mocked(getPublicPostComments).mockResolvedValue({ items: [] });
  fireEvent.click(screen.getByRole("button", { name: "Retry Comments" }));
  expect(await screen.findByText("No comments yet")).toBeTruthy();
  expect(screen.queryByText("Draft fallback")).toBeNull();
});

const firstPost = {
  slug: "first-post",
  title: "First Post",
  description: "First description",
  type: "Feature Request" as const,
  status: "New" as const,
  createdAt: new Date("2026-08-22T10:00:00.000Z"),
  updatedAt: new Date("2026-08-22T10:00:00.000Z"),
};

function render(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderView(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}
