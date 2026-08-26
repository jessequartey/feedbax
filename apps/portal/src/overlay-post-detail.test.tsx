// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

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

it("shows the designed Post detail with a canonical full-page link", async () => {
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
  expect(
    screen.getByRole("link", { name: "Open full page" }).getAttribute("href"),
  ).toBe("/p/first-post");
  expect(screen.getByRole("complementary", { name: "Details" })).toBeTruthy();
  expect(
    within(screen.getByRole("region", { name: "Comments" })).getByText(
      "Visible in the dialog",
    ),
  ).toBeTruthy();
  expect(
    await screen.findByRole("form", { name: "Comment composer" }),
  ).toBeTruthy();
  expect(getPublicPostComments).toHaveBeenCalledWith({
    data: { slug: "first-post" },
  });
  expect(screen.queryByRole("link", { name: "Back to Feedback" })).toBeNull();
});

it("keeps the Post and Comment composer available when Comment loading fails", async () => {
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
  expect(screen.getByText("No comments yet")).toBeTruthy();
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
