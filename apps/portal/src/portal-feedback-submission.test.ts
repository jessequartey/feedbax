import {
  createFeedbackModule,
  createNotionFeedbackModule,
  type FeedbackPropertyIds,
} from "@feedbax/feedback";
import { describe, expect, it, vi } from "vitest";

import { createCloudflareTurnstileVerifier } from "./cloudflare-turnstile";
import { createPortalFeedbackSubmission } from "./portal-feedback-submission";

const propertyIds: FeedbackPropertyIds = {
  title: "title-id",
  description: "description-id",
  type: "type-id",
  status: "status-id",
  published: "published-id",
  submitterName: "submitter-name-id",
  submitterEmail: "submitter-email-id",
  source: "source-id",
  externalId: "external-id",
  editTokenHash: "edit-token-hash-id",
  createdAt: "created-at-id",
  updatedAt: "updated-at-id",
};

describe("Notion-only feedback submission", () => {
  it("creates a New unpublished Feedback Item and returns its Browser Capability", async () => {
    const submit = createPortalFeedbackSubmission({
      feedback: createFeedbackModule(),
      limits: { maxTitleLength: 160, maxDescriptionLength: 5_000 },
      ...allowedSubmissionSecurity(),
    });

    const result = await submit({
      title: "Keyboard navigation",
      description: "Let participants navigate without a mouse.",
      type: "Feature Request",
    });

    expect(result).toMatchObject({
      title: "Keyboard navigation",
      description: "Let participants navigate without a mouse.",
      type: "Feature Request",
      status: "New",
      published: false,
    });
    expect(result.browserCapability).toEqual(expect.any(String));
    expect(result.browserCapability.length).toBeGreaterThanOrEqual(32);
  });

  it("rejects invalid or out-of-bounds input before the Feedback module writes", async () => {
    const notionRequest = vi.fn<typeof fetch>();
    const submit = createPortalFeedbackSubmission({
      feedback: createNotionFeedbackModule({
        token: "notion-token",
        dataSourceId: "feedback-data-source",
        propertyIds,
        request: notionRequest,
      }),
      limits: { maxTitleLength: 160, maxDescriptionLength: 5_000 },
      ...allowedSubmissionSecurity(),
    });

    const invalidInputs = [
      null,
      {},
      { title: "", description: "A description", type: "Bug Report" },
      {
        title: "t".repeat(161),
        description: "A description",
        type: "Bug Report",
      },
      { title: "A title", description: "", type: "Bug Report" },
      {
        title: "A title",
        description: "d".repeat(5_001),
        type: "Bug Report",
      },
      { title: "A title", description: "A description", type: "Other" },
    ];

    for (const input of invalidInputs) {
      await expect(submit(input)).rejects.toThrow(
        "Feedback submission is invalid.",
      );
    }
    expect(notionRequest).not.toHaveBeenCalled();
  });

  it("keeps optional unverified contact information inside the private submission", async () => {
    const feedback = createFeedbackModule();
    const submit = createPortalFeedbackSubmission({
      feedback,
      limits: { maxTitleLength: 160, maxDescriptionLength: 5_000 },
      ...allowedSubmissionSecurity(),
    });

    const submitted = await submit({
      title: "Keyboard navigation",
      description: "Let participants navigate without a mouse.",
      type: "Feature Request",
      submitter: { name: "Ama", email: "ama@example.com" },
      published: true,
      status: "Shipped",
    });

    expect(submitted.submitter).toEqual({
      name: "Ama",
      email: "ama@example.com",
    });
    expect(submitted).toMatchObject({ status: "New", published: false });
    await expect(feedback.listPublic()).resolves.toEqual({ items: [] });
  });

  it("rejects a burst-limited submission before Notion writes", async () => {
    const notionRequest = vi.fn<typeof fetch>();
    const submit = createPortalFeedbackSubmission({
      feedback: createNotionFeedbackModule({
        token: "notion-token",
        dataSourceId: "feedback-data-source",
        propertyIds,
        request: notionRequest,
      }),
      limits: { maxTitleLength: 160, maxDescriptionLength: 5_000 },
      rateLimiter: {
        limit: vi.fn().mockResolvedValue({ success: false }),
      },
      rateLimitKey: "participant-ip",
    });

    await expect(
      submit({
        title: "Keyboard navigation",
        description: "Let participants navigate without a mouse.",
        type: "Feature Request",
      }),
    ).rejects.toThrow("Feedback submission rate limit exceeded.");
    expect(notionRequest).not.toHaveBeenCalled();
  });

  it("fails closed when enabled Turnstile verification rejects the token", async () => {
    const notionRequest = vi.fn<typeof fetch>();
    const siteverifyRequest = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ success: false }));
    const submit = createPortalFeedbackSubmission({
      feedback: createNotionFeedbackModule({
        token: "notion-token",
        dataSourceId: "feedback-data-source",
        propertyIds,
        request: notionRequest,
      }),
      limits: { maxTitleLength: 160, maxDescriptionLength: 5_000 },
      ...allowedSubmissionSecurity(),
      turnstileVerifier: createCloudflareTurnstileVerifier({
        secretKey: "private-turnstile-secret",
        request: siteverifyRequest,
      }),
    });

    const rejection = submit({
      title: "Keyboard navigation",
      description: "Let participants navigate without a mouse.",
      type: "Feature Request",
      turnstileToken: "private-participant-token",
    });

    await expect(rejection).rejects.toThrow(
      "Feedback submission verification failed.",
    );
    await expect(rejection).rejects.not.toThrow("private-turnstile-secret");
    await expect(rejection).rejects.not.toThrow("private-participant-token");
    expect(notionRequest).not.toHaveBeenCalled();
    expect(siteverifyRequest).toHaveBeenCalledOnce();
  });

  it("verifies every Turnstile-enabled submission and strips the token before storage", async () => {
    const siteverifyRequest = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ success: true }));
    const submit = createPortalFeedbackSubmission({
      feedback: createFeedbackModule(),
      limits: { maxTitleLength: 160, maxDescriptionLength: 5_000 },
      ...allowedSubmissionSecurity(),
      turnstileVerifier: createCloudflareTurnstileVerifier({
        secretKey: "private-turnstile-secret",
        request: siteverifyRequest,
      }),
    });

    const result = await submit({
      title: "Keyboard navigation",
      description: "Let participants navigate without a mouse.",
      type: "Feature Request",
      turnstileToken: "private-participant-token",
    });

    expect(result).not.toHaveProperty("turnstileToken");
    expect(siteverifyRequest).toHaveBeenCalledOnce();
    const [url, init] = siteverifyRequest.mock.calls[0]!;
    expect(url).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    );
    expect(init?.method).toBe("POST");
    expect(String(init?.body)).toContain("response=private-participant-token");
  });
});

function allowedSubmissionSecurity() {
  return {
    rateLimiter: { limit: vi.fn().mockResolvedValue({ success: true }) },
    rateLimitKey: "participant-ip",
  };
}
