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
});
