import { createServerFn } from "@tanstack/react-start";

import {
  createConfiguredFeedbackModule,
  feedbackSubmissionLimits,
} from "./feedback-runtime";
import { createPortalFeedbackSubmission } from "./portal-feedback-submission";

export const submitPortalFeedback = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(({ data }) =>
    createPortalFeedbackSubmission({
      feedback: createConfiguredFeedbackModule(),
      limits: feedbackSubmissionLimits,
    })(data),
  );
