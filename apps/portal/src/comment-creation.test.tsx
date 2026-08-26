// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "@testing-library/react";

import { saveDeviceProfile } from "./browser-post-state";
import { PublicPostDetail } from "./public-post-detail";
import { submitPublicComment } from "./public-post-route";

const post = {
  slug: "roadmap-search",
  title: "Roadmap search",
  description: "Search the roadmap.",
  type: "Feature Request" as const,
  status: "Planned" as const,
  createdAt: new Date("2026-08-25T00:00:00.000Z"),
  updatedAt: new Date("2026-08-25T00:00:00.000Z"),
  voteCount: 1,
};

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
  delete window.turnstile;
});

describe("Comment creation", () => {
  it("renders a clearly identified Comment composer", () => {
    render(<PublicPostDetail post={post} submitComment={vi.fn()} />);

    const composer = screen.getByRole("form", { name: "Comment composer" });
    expect(composer.classList.contains("comment-composer")).toBe(true);
    expect(screen.getByLabelText("Add a comment").getAttribute("rows")).toBe(
      "4",
    );
    expect(
      screen.getByPlaceholderText("Share context, an example, or a question…"),
    ).toBeTruthy();
  });

  it("deserializes Notion confirmation and clears a rejected Participation Pass", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({
        comment: {
          id: "notion-comment",
          discussionId: "notion-discussion",
          body: "Confirmed",
          author: { kind: "participant", displayName: "Ari" },
          createdAt: "2026-08-25T01:00:00.000Z",
        },
      }),
    );
    const confirmed = await submitPublicComment({
      slug: "roadmap-search",
      body: "Confirmed",
      displayName: "Ari",
      email: "private@example.com",
    });
    expect(confirmed.createdAt).toEqual(new Date("2026-08-25T01:00:00.000Z"));

    sessionStorage.setItem("feedbax:participation-pass", "expired");
    vi.mocked(fetch).mockResolvedValueOnce(
      Response.json(
        {
          error: "Comment verification is required.",
          code: "verification_required",
        },
        { status: 400 },
      ),
    );
    await expect(
      submitPublicComment({
        slug: "roadmap-search",
        body: "Retry",
        displayName: "Ari",
        email: "private@example.com",
        participationPass: "expired",
      }),
    ).rejects.toThrow("verification is required");
    expect(sessionStorage.getItem("feedbax:participation-pass")).toBeNull();
  });
  it("adds a Comment optimistically and replaces it with Notion's confirmation", async () => {
    saveDeviceProfile(localStorage, {
      name: "Ari",
      email: "private@example.com",
    });
    let confirm!: (value: {
      id: string;
      discussionId: string;
      body: string;
      author: { kind: "participant"; displayName: string };
      createdAt: Date;
    }) => void;
    const submitComment = vi.fn(
      () => new Promise<never>((resolve) => (confirm = resolve as never)),
    );
    render(<PublicPostDetail post={post} submitComment={submitComment} />);

    fireEvent.change(screen.getByLabelText("Add a comment"), {
      target: { value: "Please add shortcuts." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post comment" }));
    expect(screen.getByText("Please add shortcuts.")).toBeTruthy();
    expect(submitComment).toHaveBeenCalledWith({
      slug: "roadmap-search",
      body: "Please add shortcuts.",
      displayName: "Ari",
      email: "private@example.com",
    });

    confirm({
      id: "notion-comment",
      discussionId: "notion-discussion",
      body: "Please add shortcuts.",
      author: { kind: "participant", displayName: "Ari" },
      createdAt: new Date("2026-08-25T01:00:00.000Z"),
    });
    await waitFor(() =>
      expect(screen.getAllByText("Please add shortcuts.")).toHaveLength(1),
    );
  });

  it("keeps Comment submission locked until the Device Profile has name and email", async () => {
    saveDeviceProfile(localStorage, { name: "Ari" });
    const submitComment = vi.fn();
    render(<PublicPostDetail post={post} submitComment={submitComment} />);

    fireEvent.change(screen.getByLabelText("Add a comment"), {
      target: { value: "Please add shortcuts." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post comment" }));

    expect(submitComment).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain(
      "display name and valid email",
    );
  });

  it("rolls back a rejected Comment and shows an actionable error", async () => {
    saveDeviceProfile(localStorage, {
      name: "Ari",
      email: "private@example.com",
    });
    render(
      <PublicPostDetail
        post={post}
        submitComment={() =>
          Promise.reject(new Error("Notion timed out. Try again."))
        }
      />,
    );
    fireEvent.change(screen.getByLabelText("Add a comment"), {
      target: { value: "Temporary message" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post comment" }));
    expect(screen.getByText("Temporary message")).toBeTruthy();
    await screen.findByRole("alert");
    expect(screen.queryByText("Temporary message")).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("Try again");
  });

  it("renders a fresh Turnstile challenge after a stale Participation Pass is rejected", async () => {
    saveDeviceProfile(localStorage, {
      name: "Ari",
      email: "private@example.com",
    });
    sessionStorage.setItem("feedbax:participation-pass", "expired");
    const renderTurnstile = vi.fn().mockReturnValue("widget-1");
    window.turnstile = { render: renderTurnstile, reset: vi.fn() };
    render(
      <PublicPostDetail
        post={post}
        turnstileSiteKey="public-site-key"
        submitComment={() => {
          sessionStorage.removeItem("feedbax:participation-pass");
          return Promise.reject(new Error("Comment verification is required."));
        }}
      />,
    );
    fireEvent.change(screen.getByLabelText("Add a comment"), {
      target: { value: "Retry with verification" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post comment" }));

    await screen.findByRole("alert");
    await waitFor(() => expect(renderTurnstile).toHaveBeenCalled());
  });

  it("rolls back an optimistic Comment edit when the server rejects it", async () => {
    localStorage.setItem(
      "feedbax:comment-capabilities",
      JSON.stringify({
        "comment-1": {
          capability: "signed-capability",
          expiresAt: Date.now() + 60_000,
        },
      }),
    );
    vi.spyOn(window, "prompt").mockReturnValue("Corrected message");
    let rejectMutation!: (reason: Error) => void;
    const mutateComment = vi.fn(
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectMutation = reject;
        }),
    );
    render(
      <PublicPostDetail
        post={post}
        comments={{
          items: [
            {
              id: "discussion-1",
              comments: [
                {
                  id: "comment-1",
                  body: "Original message",
                  author: { kind: "participant", displayName: "Ari" },
                  createdAt: new Date("2026-08-25T01:00:00.000Z"),
                },
              ],
            },
          ],
        }}
        mutateComment={mutateComment}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByText("Corrected message")).toBeTruthy();
    expect(mutateComment).toHaveBeenCalledWith({
      action: "edit",
      commentId: "comment-1",
      commentCapability: "signed-capability",
      body: "Corrected message",
    });
    rejectMutation(new Error("Notion rejected the update. Try again."));
    await screen.findByRole("alert");
    expect(screen.getByText("Original message")).toBeTruthy();
    expect(screen.queryByText("Corrected message")).toBeNull();
  });
});
