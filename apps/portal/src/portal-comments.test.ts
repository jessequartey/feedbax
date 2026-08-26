import { createFeedbackModule } from "@feedbax/feedback";
import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import {
  createPortalCommentHandler,
  createPortalCommentMutationHandler,
  createPortalCommentRequestHandler,
} from "./portal-comments";

const signingSecret = "a-high-entropy-secret-with-at-least-32-characters";

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
      participationSigningSecret: signingSecret,
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
      participationSigningSecret: signingSecret,
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
      participationSigningSecret: signingSecret,
    });
    await expect(
      comment({ slug: "post", body: "Hello", displayName: "Ari" }),
    ).rejects.toThrow("Comment rate limit exceeded");
  });

  it("issues a scoped fifteen-minute capability after creation and authorizes edit and delete", async () => {
    const now = Date.now();
    const feedback = publishedFeedback();
    const secret = "a-high-entropy-secret-with-at-least-32-characters";
    const create = createPortalCommentHandler({
      feedback,
      commentsEnabled: true,
      rateLimiter: { limit: vi.fn().mockResolvedValue({ success: true }) },
      rateLimitKey: "participant-ip",
      participationSigningSecret: secret,
      now: () => now,
    });
    const created = await create({
      slug: "post",
      body: "Original",
      displayName: "Ari",
    });
    expect(created.commentCapability).toEqual(expect.any(String));

    const mutate = createPortalCommentMutationHandler({
      feedback,
      commentsEnabled: true,
      rateLimiter: { limit: vi.fn().mockResolvedValue({ success: true }) },
      rateLimitKey: "participant-ip",
      participationSigningSecret: secret,
      now: () => now,
    });
    await expect(
      mutate({
        action: "edit",
        commentId: created.comment.id,
        commentCapability: created.commentCapability,
        body: "Corrected",
      }),
    ).resolves.toMatchObject({ comment: { body: "Corrected" } });
    await expect(
      mutate({
        action: "delete",
        commentId: created.comment.id,
        commentCapability: created.commentCapability,
      }),
    ).resolves.toEqual({ deleted: true });
  });

  it("rejects tampered, cross-Comment, expired, and Product Team Comment capabilities uniformly", async () => {
    let now = Date.now();
    const feedback = publishedFeedback();
    const secret = "a-high-entropy-secret-with-at-least-32-characters";
    const create = createPortalCommentHandler({
      feedback,
      commentsEnabled: true,
      rateLimiter: { limit: vi.fn().mockResolvedValue({ success: true }) },
      rateLimitKey: "participant-ip",
      participationSigningSecret: secret,
      now: () => now,
    });
    const first = await create({
      slug: "post",
      body: "First",
      displayName: "Ari",
    });
    const second = await create({
      slug: "post",
      body: "Second",
      displayName: "Ari",
    });
    const mutate = createPortalCommentMutationHandler({
      feedback,
      commentsEnabled: true,
      rateLimiter: { limit: vi.fn().mockResolvedValue({ success: true }) },
      rateLimitKey: "participant-ip",
      participationSigningSecret: secret,
      now: () => now,
    });
    const rejected = "Comment could not be changed with this capability.";

    await expect(
      mutate({
        action: "delete",
        commentId: second.comment.id,
        commentCapability: first.commentCapability,
      }),
    ).rejects.toThrow(rejected);
    await expect(
      mutate({
        action: "delete",
        commentId: first.comment.id,
        commentCapability: `${first.commentCapability}x`,
      }),
    ).rejects.toThrow(rejected);
    now += 15 * 60 * 1_000 + 1;
    await expect(
      mutate({
        action: "delete",
        commentId: first.comment.id,
        commentCapability: first.commentCapability,
      }),
    ).rejects.toThrow(rejected);
  });

  it("enforces the exact expiry boundary and cannot mutate Product Team Comments", async () => {
    const createdAt = new Date();
    let now = createdAt.getTime() + 15 * 60 * 1_000 - 1;
    const feedback = createFeedbackModule({
      initialItems: [
        {
          id: "post",
          slug: "post",
          title: "Post",
          description: "Visible.",
          type: "Feature Request",
          status: "Planned",
          published: true,
          createdAt,
          updatedAt: createdAt,
        },
      ],
      initialComments: [
        {
          id: "team-comment",
          postId: "post",
          discussionId: "discussion",
          body: "Official response",
          author: { kind: "product-team", displayName: "Product Team" },
          createdAt,
          resolved: false,
        },
      ],
    });
    const capability = commentCapabilityFor(
      "team-comment",
      createdAt.getTime() + 15 * 60 * 1_000,
      signingSecret,
    );
    const mutate = createPortalCommentMutationHandler({
      feedback,
      commentsEnabled: true,
      rateLimiter: { limit: vi.fn().mockResolvedValue({ success: true }) },
      rateLimitKey: "participant-ip",
      participationSigningSecret: signingSecret,
      now: () => now,
    });

    await expect(
      mutate({
        action: "delete",
        commentId: "team-comment",
        commentCapability: capability,
      }),
    ).rejects.toThrow("no longer available");
    now += 1;
    await expect(
      mutate({
        action: "delete",
        commentId: "team-comment",
        commentCapability: capability,
      }),
    ).rejects.toThrow("could not be changed with this capability");
  });

  it("rate-limits Comment mutations and requires a current Participation Pass when verification is enabled", async () => {
    const feedback = publishedFeedback();
    const createdAt = Date.now();
    const blocked = createPortalCommentMutationHandler({
      feedback,
      commentsEnabled: true,
      rateLimiter: { limit: vi.fn().mockResolvedValue({ success: false }) },
      rateLimitKey: "participant-ip",
      participationSigningSecret: signingSecret,
      now: () => createdAt,
    });
    await expect(
      blocked({
        action: "delete",
        commentId: "comment",
        commentCapability: commentCapabilityFor(
          "comment",
          createdAt + 60_000,
          signingSecret,
        ),
      }),
    ).rejects.toThrow("rate limit exceeded");

    const verificationRequired = createPortalCommentMutationHandler({
      feedback,
      commentsEnabled: true,
      rateLimiter: { limit: vi.fn().mockResolvedValue({ success: true }) },
      rateLimitKey: "participant-ip",
      turnstileVerifier: { verify: vi.fn() },
      participationSigningSecret: signingSecret,
      now: () => createdAt,
    });
    await expect(
      verificationRequired({
        action: "delete",
        commentId: "comment",
        commentCapability: commentCapabilityFor(
          "comment",
          createdAt + 60_000,
          signingSecret,
        ),
      }),
    ).rejects.toThrow("verification is required");
  });
});

function commentCapabilityFor(
  commentId: string,
  expiresAt: number,
  secret: string,
) {
  const payload = Buffer.from(
    JSON.stringify({ commentId, actions: ["edit", "delete"], expiresAt }),
  ).toString("base64url");
  const signature = createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}
