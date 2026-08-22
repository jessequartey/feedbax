// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { OverlayPostDetail } from "./overlay-post-detail";
import { getPublicPost } from "./public-post-server-function";

vi.mock("./public-post-server-function", () => ({
  getPublicPost: vi.fn(),
}));
vi.mock("./authorized-draft-post", () => ({
  AuthorizedDraftPost: () => <p>Draft fallback</p>,
}));

afterEach(() => {
  cleanup();
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

const firstPost = {
  slug: "first-post",
  title: "First Post",
  description: "First description",
  type: "Feature Request" as const,
  status: "New" as const,
  createdAt: new Date("2026-08-22T10:00:00.000Z"),
  updatedAt: new Date("2026-08-22T10:00:00.000Z"),
};
