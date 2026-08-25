import { createFeedbackModule } from "@feedbax/feedback";
import { describe, expect, it, vi } from "vitest";

import {
  createInvalidatingFeedbackModule,
  createPublicCacheInvalidator,
} from "./feedback-cache-invalidation";

describe("feedback cache invalidation", () => {
  it("purges only feedback-list and changed-Post tags after a successful write", async () => {
    const purge = vi.fn().mockResolvedValue({ success: true, errors: [] });
    const feedback = createInvalidatingFeedbackModule({
      feedback: createFeedbackModule(),
      invalidator: createPublicCacheInvalidator({ purge }),
    });

    const submitted = await feedback.submitPost({
      title: "Keyboard navigation",
      description: "Let participants navigate without a mouse.",
      type: "Feature Request",
    });

    expect(purge).toHaveBeenCalledWith({
      tags: ["feedbax-feedback", `feedbax-post-${submitted.slug}`],
    });
    expect(purge.mock.calls[0]?.[0].tags).not.toContain("feedbax-roadmap");
  });

  it("invalidates public feedback after a trusted submission", async () => {
    const invalidatePost = vi.fn().mockResolvedValue(undefined);
    const feedback = createInvalidatingFeedbackModule({
      feedback: createFeedbackModule(),
      invalidator: { invalidatePost, invalidateVote: invalidatePost },
    });

    const submitted = await feedback.submitTrustedPost({
      externalId: "product-a:feedback-123",
      title: "Keyboard navigation",
      description: "Let participants navigate without a mouse.",
      type: "Feature Request",
    });

    expect(invalidatePost).toHaveBeenCalledExactlyOnceWith(submitted.slug);
  });

  it("invalidates feed, Post detail, and roadmap projections after a confirmed Vote", async () => {
    const purge = vi.fn().mockResolvedValue({ success: true, errors: [] });
    const now = new Date("2026-08-25T10:00:00.000Z");
    const feedback = createInvalidatingFeedbackModule({
      feedback: createFeedbackModule({
        initialItems: [
          {
            id: "post-id",
            slug: "keyboard-navigation",
            title: "Keyboard navigation",
            description: "Navigate without a mouse.",
            type: "Feature Request",
            status: "Planned",
            published: true,
            voteCount: 2,
            createdAt: now,
            updatedAt: now,
          },
        ],
      }),
      invalidator: createPublicCacheInvalidator({ purge }),
    });

    await feedback.changeVote({
      slug: "keyboard-navigation",
      intention: "add",
    });

    expect(purge).toHaveBeenCalledWith({
      tags: [
        "feedbax-feedback",
        "feedbax-post-keyboard-navigation",
        "feedbax-roadmap",
      ],
    });
  });

  it("keeps a confirmed Vote successful when cache invalidation fails", async () => {
    const now = new Date("2026-08-25T10:00:00.000Z");
    const feedback = createInvalidatingFeedbackModule({
      feedback: createFeedbackModule({
        initialItems: [
          {
            id: "post-id",
            slug: "keyboard-navigation",
            title: "Keyboard navigation",
            description: "Navigate without a mouse.",
            type: "Feature Request",
            status: "Planned",
            published: true,
            voteCount: 2,
            createdAt: now,
            updatedAt: now,
          },
        ],
      }),
      invalidator: {
        invalidatePost: vi.fn(),
        invalidateVote: vi.fn().mockRejectedValue(new Error("purge failed")),
      },
    });

    await expect(
      feedback.changeVote({
        slug: "keyboard-navigation",
        intention: "add",
      }),
    ).resolves.toEqual({ slug: "keyboard-navigation", voteCount: 3 });
  });

  it("invalidates after edits and withdrawals without passing private write data", async () => {
    const invalidatePost = vi.fn().mockResolvedValue(undefined);
    const feedback = createInvalidatingFeedbackModule({
      feedback: createFeedbackModule(),
      invalidator: { invalidatePost, invalidateVote: invalidatePost },
    });
    const submitted = await feedback.submitPost({
      title: "Original title",
      description: "Original description",
      type: "General Feedback",
      submitter: { email: "private@example.com" },
    });
    invalidatePost.mockClear();

    await feedback.editDraftPost({
      id: submitted.id,
      browserCapability: submitted.browserCapability,
      title: "Revised title",
      description: "Revised description",
      type: "Bug Report",
    });
    await feedback.withdrawDraftPost({
      id: submitted.id,
      browserCapability: submitted.browserCapability,
    });

    expect(invalidatePost.mock.calls).toEqual([
      [submitted.slug],
      [submitted.slug],
    ]);
  });

  it("does not purge when a write fails", async () => {
    const invalidatePost = vi.fn().mockResolvedValue(undefined);
    const feedback = createInvalidatingFeedbackModule({
      feedback: {
        ...createFeedbackModule(),
        submitPost: vi.fn().mockRejectedValue(new Error("write failed")),
      },
      invalidator: { invalidatePost, invalidateVote: invalidatePost },
    });

    await expect(
      feedback.submitPost({
        title: "Keyboard navigation",
        description: "Let participants navigate without a mouse.",
        type: "Feature Request",
      }),
    ).rejects.toThrow("write failed");
    expect(invalidatePost).not.toHaveBeenCalled();
  });

  it("reports purge rejection without exposing Cloudflare details", async () => {
    const invalidator = createPublicCacheInvalidator({
      purge: vi.fn().mockResolvedValue({
        success: false,
        errors: [{ code: 1234, message: "private infrastructure detail" }],
      }),
    });

    const invalidation = invalidator.invalidatePost("feedback-123");

    await expect(invalidation).rejects.toThrow(
      "Public feedback cache invalidation failed.",
    );
    await expect(invalidation).rejects.not.toThrow(
      "private infrastructure detail",
    );
  });
});
