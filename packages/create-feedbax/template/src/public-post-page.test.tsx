// @vitest-environment jsdom

import { createFeedbackModule } from "@feedbax/feedback";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPublicPost, postPath } from "./public-post-page";
import {
  PublicPostDetail,
  PublicPostDetailSkeleton,
} from "./public-post-detail";

afterEach(cleanup);

describe("canonical Post page", () => {
  it("uses only the immutable slug as public identity", async () => {
    const feedback = createFeedbackModule({
      initialItems: [
        {
          id: "secret-id",
          slug: "clean-post",
          title: "Clean Post",
          description: "Body",
          type: "Feature Request",
          status: "New",
          published: true,
          createdAt: new Date("2026-01-01"),
          updatedAt: new Date("2026-01-01"),
        },
      ],
    });
    const post = await loadPublicPost({ feedback, slug: "clean-post" });
    expect(postPath(post!)).toBe("/p/clean-post");
    expect(post).not.toHaveProperty("id");
  });

  it("gives missing and unpublished Posts the same safe unavailable state", async () => {
    const feedback = createFeedbackModule({
      initialItems: [
        {
          id: "private-id",
          slug: "private-post",
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
      loadPublicPost({ feedback, slug: "private-post" }),
    ).resolves.toBeUndefined();
    await expect(
      loadPublicPost({ feedback, slug: "missing-post" }),
    ).resolves.toBeUndefined();
  });

  it("renders a contextual Post detail skeleton", () => {
    const html = renderToStaticMarkup(<PublicPostDetailSkeleton />);

    expect(html).toContain('aria-label="Loading Post details"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading Post details…");
  });

  it("shows the Post summary with a Vote toggle", () => {
    render(<PublicPostDetail post={publicPost} />);

    expect(
      screen.getByRole("heading", { name: "Keyboard-first search" }),
    ).toBeTruthy();
    expect(screen.getAllByText("Feature Request").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Planned").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Add Vote, 0 Votes" }),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Comments unavailable")).toBeNull();
  });

  it("persists voted state only after confirmation and rolls back a failed optimistic Vote", async () => {
    localStorage.clear();
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ voteCount: 1 }))
      .mockResolvedValueOnce(
        Response.json(
          {
            error: "Vote verification is required.",
            code: "verification_required",
          },
          { status: 400 },
        ),
      );
    render(<PublicPostDetail post={publicPost} />);
    const button = screen.getByRole("button", { name: "Add Vote, 0 Votes" });

    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("true");
    await waitFor(() => expect(button.textContent).toContain("1"));
    expect(localStorage.getItem("feedbax:voted-posts")).toContain(
      publicPost.slug,
    );

    sessionStorage.setItem("feedbax:participation-pass", "expired-pass");
    fireEvent.click(button);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "verification is required",
      ),
    );
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.textContent).toContain("1");
    expect(localStorage.getItem("feedbax:voted-posts")).toContain(
      publicPost.slug,
    );
    expect(sessionStorage.getItem("feedbax:participation-pass")).toBeNull();
    fetchMock.mockRestore();
  });

  it("shows only public metadata in the Details sidebar", () => {
    render(<PublicPostDetail post={publicPost} />);

    const details = within(
      screen.getByRole("complementary", { name: "Details" }),
    );
    expect(details.getByText("Status")).toBeTruthy();
    expect(details.getByText("Planned")).toBeTruthy();
    expect(details.getByText("Post type")).toBeTruthy();
    expect(details.getByText("Feature Request")).toBeTruthy();
    expect(details.getByText("Submitted")).toBeTruthy();
    expect(details.getByText("August 20, 2026")).toBeTruthy();
    expect(details.getByText("Updated")).toBeTruthy();
    expect(details.getByText("August 22, 2026")).toBeTruthy();
    expect(details.queryByText("Author")).toBeNull();
  });

  it("renders an honest empty Comments state without unavailable controls", () => {
    render(<PublicPostDetail post={publicPost} />);

    const comments = within(screen.getByRole("region", { name: "Comments" }));
    expect(comments.getByText("No comments yet")).toBeTruthy();
    expect(comments.queryByText(/isn’t available/)).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /comment|follow/i }),
    ).toBeNull();
  });
});

const publicPost = {
  slug: "keyboard-first-search",
  title: "Keyboard-first search",
  description: "Open search without reaching for the mouse.",
  type: "Feature Request" as const,
  status: "Planned" as const,
  voteCount: 0,
  createdAt: new Date("2026-08-20T10:00:00.000Z"),
  updatedAt: new Date("2026-08-22T10:00:00.000Z"),
};
