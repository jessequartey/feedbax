import { describe, expect, it, vi } from "vitest";
import { createPortalVoteHandler } from "./portal-voting";
import { createFeedbackModule } from "@feedbax/feedback";

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
        voteCount: 2,
        createdAt: now,
        updatedAt: now,
      },
    ],
  });
}

describe("portal Vote handler", () => {
  it("rate-limits Vote operations and returns an actionable error", async () => {
    const feedback = publishedFeedback();
    const vote = createPortalVoteHandler({
      feedback,
      votingEnabled: true,
      rateLimiter: { limit: vi.fn().mockResolvedValue({ success: false }) },
      rateLimitKey: "participant-ip",
    });

    await expect(vote({ slug: "post", intention: "add" })).rejects.toThrow(
      "Vote rate limit exceeded",
    );
    await expect(feedback.getPublicPost("post")).resolves.toMatchObject({
      voteCount: 2,
    });
  });

  it("issues a thirty-minute Participation Pass after first verification and accepts reuse", async () => {
    let now = 1_000;
    const verify = vi.fn().mockResolvedValue(true);
    const options = {
      feedback: publishedFeedback(),
      votingEnabled: true,
      rateLimiter: { limit: vi.fn().mockResolvedValue({ success: true }) },
      rateLimitKey: "participant-ip",
      turnstileVerifier: { verify },
      participationSigningSecret:
        "a-high-entropy-secret-with-at-least-32-characters",
      now: () => now,
    };
    const vote = createPortalVoteHandler(options);
    const first = await vote({
      slug: "post",
      intention: "add",
      turnstileToken: "verified",
    });
    now += 29 * 60 * 1_000;
    await vote({
      slug: "post",
      intention: "remove",
      participationPass: first.participationPass,
    });

    expect(first.participationPass).toEqual(expect.any(String));
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it("fails closed for a tampered or expired Participation Pass", async () => {
    let now = 1_000;
    const vote = createPortalVoteHandler({
      feedback: publishedFeedback(),
      votingEnabled: true,
      rateLimiter: { limit: vi.fn().mockResolvedValue({ success: true }) },
      rateLimitKey: "participant-ip",
      turnstileVerifier: { verify: vi.fn().mockResolvedValue(true) },
      participationSigningSecret:
        "a-high-entropy-secret-with-at-least-32-characters",
      now: () => now,
    });
    const first = await vote({
      slug: "post",
      intention: "add",
      turnstileToken: "verified",
    });
    now += 31 * 60 * 1_000;
    await expect(
      vote({
        slug: "post",
        intention: "remove",
        participationPass: first.participationPass,
      }),
    ).rejects.toThrow("verification is required");
    await expect(
      vote({
        slug: "post",
        intention: "remove",
        participationPass: `${first.participationPass}x`,
      }),
    ).rejects.toThrow("verification is required");
  });
});
