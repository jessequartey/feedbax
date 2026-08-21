import { createFeedbackModule } from "@feedbax/feedback";
import { describe, expect, it, vi } from "vitest";

import {
  createInvalidatingFeedbackModule,
  createPublicCacheInvalidator,
} from "./feedback-cache-invalidation";

describe("feedback cache invalidation", () => {
  it("purges only feedback-list and changed-item tags after a successful write", async () => {
    const purge = vi.fn().mockResolvedValue({ success: true, errors: [] });
    const feedback = createInvalidatingFeedbackModule({
      feedback: createFeedbackModule(),
      invalidator: createPublicCacheInvalidator({ purge }),
    });

    const submitted = await feedback.submit({
      title: "Keyboard navigation",
      description: "Let participants navigate without a mouse.",
      type: "Feature Request",
    });

    expect(purge).toHaveBeenCalledWith({
      tags: ["feedbax-feedback", `feedbax-item-${submitted.id}`],
    });
    expect(purge.mock.calls[0]?.[0].tags).not.toContain("feedbax-roadmap");
  });

  it("invalidates public feedback after a trusted submission", async () => {
    const invalidateFeedbackItem = vi.fn().mockResolvedValue(undefined);
    const feedback = createInvalidatingFeedbackModule({
      feedback: createFeedbackModule(),
      invalidator: { invalidateFeedbackItem },
    });

    const submitted = await feedback.submitTrusted({
      externalId: "product-a:feedback-123",
      title: "Keyboard navigation",
      description: "Let participants navigate without a mouse.",
      type: "Feature Request",
    });

    expect(invalidateFeedbackItem).toHaveBeenCalledExactlyOnceWith(
      submitted.id,
    );
  });

  it("invalidates after edits and withdrawals without passing private write data", async () => {
    const invalidateFeedbackItem = vi.fn().mockResolvedValue(undefined);
    const feedback = createInvalidatingFeedbackModule({
      feedback: createFeedbackModule(),
      invalidator: { invalidateFeedbackItem },
    });
    const submitted = await feedback.submit({
      title: "Original title",
      description: "Original description",
      type: "General Feedback",
      submitter: { email: "private@example.com" },
    });
    invalidateFeedbackItem.mockClear();

    await feedback.editDraft({
      id: submitted.id,
      browserCapability: submitted.browserCapability,
      title: "Revised title",
      description: "Revised description",
      type: "Bug Report",
    });
    await feedback.withdrawDraft({
      id: submitted.id,
      browserCapability: submitted.browserCapability,
    });

    expect(invalidateFeedbackItem.mock.calls).toEqual([
      [submitted.id],
      [submitted.id],
    ]);
  });

  it("does not purge when a write fails", async () => {
    const invalidateFeedbackItem = vi.fn().mockResolvedValue(undefined);
    const feedback = createInvalidatingFeedbackModule({
      feedback: {
        ...createFeedbackModule(),
        submit: vi.fn().mockRejectedValue(new Error("write failed")),
      },
      invalidator: { invalidateFeedbackItem },
    });

    await expect(
      feedback.submit({
        title: "Keyboard navigation",
        description: "Let participants navigate without a mouse.",
        type: "Feature Request",
      }),
    ).rejects.toThrow("write failed");
    expect(invalidateFeedbackItem).not.toHaveBeenCalled();
  });

  it("reports purge rejection without exposing Cloudflare details", async () => {
    const invalidator = createPublicCacheInvalidator({
      purge: vi.fn().mockResolvedValue({
        success: false,
        errors: [{ code: 1234, message: "private infrastructure detail" }],
      }),
    });

    const invalidation = invalidator.invalidateFeedbackItem("feedback-123");

    await expect(invalidation).rejects.toThrow(
      "Public feedback cache invalidation failed.",
    );
    await expect(invalidation).rejects.not.toThrow(
      "private infrastructure detail",
    );
  });
});
