import {
  createFeedbackModule,
  createNotionFeedbackModule,
  type FeedbackPropertyIds,
} from "@feedbax/feedback";
import { describe, expect, it, vi } from "vitest";

import { createCloudflareTurnstileVerifier } from "./cloudflare-turnstile";
import {
  createPortalDraftManagement,
  createPortalFeedbackSubmission,
} from "./portal-feedback-submission";

const propertyIds: FeedbackPropertyIds = {
  title: "title-id",
  slug: "slug-id",
  description: "description-id",
  type: "type-id",
  status: "status-id",
  published: "published-id",
  voteCount: "vote-count-id",
  submitterName: "submitter-name-id",
  submitterEmail: "submitter-email-id",
  source: "source-id",
  externalId: "external-id",
  editTokenHash: "edit-token-hash-id",
  createdAt: "created-at-id",
  updatedAt: "updated-at-id",
};

describe("Notion-only feedback submission", () => {
  it("edits permitted draft fields through the portal mutation boundary", async () => {
    const feedback = createFeedbackModule();
    const submitted = await feedback.submitPost({
      title: "Original title",
      description: "Original description",
      type: "General Feedback",
    });
    const drafts = createPortalDraftManagement({
      feedback,
      limits: { maxTitleLength: 160, maxDescriptionLength: 5_000 },
    });

    await expect(
      drafts.edit({
        id: submitted.id,
        browserCapability: submitted.browserCapability,
        title: "Corrected title",
        description: "Corrected description",
        type: "Bug Report",
      }),
    ).resolves.toMatchObject({
      id: submitted.id,
      title: "Corrected title",
      description: "Corrected description",
      type: "Bug Report",
    });
  });

  it("withdraws an eligible draft through the portal mutation boundary", async () => {
    const feedback = createFeedbackModule();
    const submitted = await feedback.submitPost({
      title: "Withdraw this draft",
      description: "This submission is no longer needed.",
      type: "General Feedback",
    });
    const drafts = createPortalDraftManagement({
      feedback,
      limits: { maxTitleLength: 160, maxDescriptionLength: 5_000 },
    });

    await expect(
      drafts.withdraw({
        id: submitted.id,
        browserCapability: submitted.browserCapability,
      }),
    ).resolves.toBeUndefined();
  });

  it("creates a New unpublished Post and returns its Browser Capability", async () => {
    const submit = createPortalFeedbackSubmission({
      feedback: createFeedbackModule(),
      limits: { maxTitleLength: 160, maxDescriptionLength: 5_000 },
      ...allowedSubmissionSecurity(),
    });

    const result = await submit({
      title: "Keyboard navigation",
      description: "Let participants navigate without a mouse.",
      type: "Feature Request",
      submitter: { name: "Ama", email: "ama@example.com" },
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

    const completeSubmitter = { name: "Ama", email: "ama@example.com" };
    const invalidInputs = [
      null,
      {},
      {
        title: "A title",
        description: "A description",
        type: "Bug Report",
      },
      {
        title: "A title",
        description: "A description",
        type: "Bug Report",
        submitter: { name: "Ama" },
      },
      {
        title: "A title",
        description: "A description",
        type: "Bug Report",
        submitter: { name: "Ama", email: "not-an-email" },
      },
      {
        title: "",
        description: "A description",
        type: "Bug Report",
        submitter: completeSubmitter,
      },
      {
        title: "t".repeat(161),
        description: "A description",
        type: "Bug Report",
        submitter: completeSubmitter,
      },
      {
        title: "A title",
        description: "",
        type: "Bug Report",
        submitter: completeSubmitter,
      },
      {
        title: "A title",
        description: "d".repeat(5_001),
        type: "Bug Report",
        submitter: completeSubmitter,
      },
      {
        title: "A title",
        description: "A description",
        type: "Other",
        submitter: completeSubmitter,
      },
    ];

    for (const input of invalidInputs) {
      await expect(submit(input)).rejects.toThrow(
        "Feedback submission is invalid.",
      );
    }
    expect(notionRequest).not.toHaveBeenCalled();
  });

  it("keeps required unverified profile details inside the private submission", async () => {
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
    await expect(feedback.listPublicPosts()).resolves.toEqual({ items: [] });
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
      submitter: { name: "Ama", email: "ama@example.com" },
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
      submitter: { name: "Ama", email: "ama@example.com" },
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
