import { createFeedbackModule } from "@feedbax/feedback";
import { describe, expect, it, vi } from "vitest";

import {
  createPortalCommentHandler,
  createPortalCommentRequestHandler,
} from "./portal-comments";

function publishedFeedback() {
  const now = new Date("2026-08-25T00:00:00.000Z");
  return createFeedbackModule({
    initialItems: [
      {
        id: "post",
        slug: "post",
        title: "Post",
        description: "Visible.",
        type: "Feature Request",
        status: "Planned",
        published: true,
        createdAt: now,
        updatedAt: now,
      },
    ],
  });
}

describe("portal Comment handler", () => {
  it("requires an unverified Device Profile name and omits email from the command", async () => {
    const feedback = publishedFeedback();
    const comment = createPortalCommentRequestHandler({
      feedback,
      commentsEnabled: true,
      rateLimiter: { limit: vi.fn().mockResolvedValue({ success: true }) },
      rateLimitKey: "participant-ip",
    });

    const response = await comment(
      new Request("https://portal.test/internal/comments", {
        method: "POST",
        body: JSON.stringify({
          slug: "post",
          body: "Hello",
          displayName: "Ari",
          email: "private@example.com",
        }),
      }),
    );
    const serialized = await response.text();
    expect(response.status).toBe(200);
    expect(serialized).not.toContain("private@example.com");
    await expect(
      feedback.listCommentThreads({ slug: "post" }),
    ).resolves.toMatchObject({
      items: [
        {
          comments: [
            {
              body: "Hello",
              author: { kind: "participant", displayName: "Ari" },
            },
          ],
        },
      ],
    });

    const missingProfile = await comment(
      new Request("https://portal.test/internal/comments", {
        method: "POST",
        body: JSON.stringify({ slug: "post", body: "Hello", displayName: " " }),
      }),
    );
    await expect(missingProfile.json()).resolves.toMatchObject({
      error: expect.stringContaining("display name is required"),
    });
  });

  it("creates replies, rate-limits writes, and reuses a thirty-minute Participation Pass", async () => {
    let now = 1_000;
    const verify = vi.fn().mockResolvedValue(true);
    const rateLimit = vi.fn().mockResolvedValue({ success: true });
    const comment = createPortalCommentHandler({
      feedback: publishedFeedback(),
      commentsEnabled: true,
      rateLimiter: { limit: rateLimit },
      rateLimitKey: "participant-ip",
      turnstileVerifier: { verify },
      participationSigningSecret:
        "a-high-entropy-secret-with-at-least-32-characters",
      now: () => now,
    });
    const first = await comment({
      slug: "post",
      body: "Top level",
      displayName: "Ari",
      turnstileToken: "verified",
    });
    now += 29 * 60 * 1_000;
    const reply = await comment({
      slug: "post",
      discussionId: first.comment.discussionId,
      body: "Reply",
      displayName: "Ari",
      participationPass: first.participationPass,
    });

    expect(reply.comment.discussionId).toBe(first.comment.discussionId);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(rateLimit).toHaveBeenCalledWith({ key: "comment:participant-ip" });
  });

  it("returns an actionable failure when the Comment rate limit is exceeded", async () => {
    const comment = createPortalCommentHandler({
      feedback: publishedFeedback(),
      commentsEnabled: true,
      rateLimiter: { limit: vi.fn().mockResolvedValue({ success: false }) },
      rateLimitKey: "participant-ip",
    });
    await expect(
      comment({ slug: "post", body: "Hello", displayName: "Ari" }),
    ).rejects.toThrow("Comment rate limit exceeded");
  });
});
