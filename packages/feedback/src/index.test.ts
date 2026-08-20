import { describe, expect, it } from "vitest";

import { createFeedbackModule } from "./index";

describe("Feedback module", () => {
  it("submits a New, unpublished Feedback Item", async () => {
    const feedback = createFeedbackModule();

    const item = await feedback.submit({
      title: "Add keyboard shortcuts",
      description: "Let me navigate the portal without a mouse.",
      type: "Feature Request",
      submitter: {
        name: "Amina",
        email: "amina@example.com",
      },
    });

    expect(item).toMatchObject({
      title: "Add keyboard shortcuts",
      description: "Let me navigate the portal without a mouse.",
      type: "Feature Request",
      status: "New",
      published: false,
      submitter: {
        name: "Amina",
        email: "amina@example.com",
      },
    });
  });

  it("excludes unpublished Feedback Items from public retrieval", async () => {
    const feedback = createFeedbackModule();

    await feedback.submit({
      title: "Private draft",
      description: "This has not been approved for public display.",
      type: "General Feedback",
    });

    await expect(feedback.listPublic()).resolves.toEqual([]);
  });

  it("does not let a caller publish a submitted Feedback Item by mutation", async () => {
    const feedback = createFeedbackModule();
    const submittedItem = await feedback.submit({
      title: "Private draft",
      description: "This has not been approved for public display.",
      type: "General Feedback",
    });

    submittedItem.published = true;

    await expect(feedback.listPublic()).resolves.toEqual([]);
  });

  it("returns only the approved public projection for a Published Feedback Item", async () => {
    const createdAt = new Date("2026-08-19T10:00:00.000Z");
    const updatedAt = new Date("2026-08-20T09:30:00.000Z");
    const feedback = createFeedbackModule({
      initialItems: [
        {
          id: "feedback-item-id",
          title: "Add keyboard shortcuts",
          description: "Let me navigate the portal without a mouse.",
          type: "Feature Request",
          status: "New",
          published: true,
          createdAt,
          updatedAt,
          submitter: {
            name: "Amina",
            email: "amina@example.com",
          },
          browserCapabilityHash: "secret-hash",
          source: "portal",
          pageBody: "Private notes from the Product Team",
          customProperty: "must not leak",
        },
      ],
    });

    await expect(feedback.listPublic()).resolves.toEqual([
      {
        title: "Add keyboard shortcuts",
        description: "Let me navigate the portal without a mouse.",
        type: "Feature Request",
        status: "New",
        createdAt,
        updatedAt,
      },
    ]);
  });
});
