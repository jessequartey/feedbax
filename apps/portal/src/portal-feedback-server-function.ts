import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";

import {
  createConfiguredFeedbackModule,
  feedbackSubmissionLimits,
} from "./feedback-runtime";
import {
  createPortalDraftManagement,
  createPortalFeedbackSubmission,
} from "./portal-feedback-submission";
import {
  createPortalSubmissionSecurity,
  warnIfTurnstileDisabled,
} from "./portal-feedback-runtime";

export const submitPortalFeedback = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) => {
    const { env } = await import("cloudflare:workers");
    warnIfTurnstileDisabled({
      environment: env,
      nodeEnv: import.meta.env.PROD ? "production" : "development",
    });
    return createPortalFeedbackSubmission({
      feedback: createConfiguredFeedbackModule(),
      limits: feedbackSubmissionLimits,
      ...createPortalSubmissionSecurity({
        environment: env,
        rateLimitKey: getRequestIP() ?? "unknown-participant-ip",
      }),
    })(data);
  });

export const editPortalFeedbackDraft = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(({ data }) =>
    createPortalDraftManagement({
      feedback: createConfiguredFeedbackModule(),
      limits: feedbackSubmissionLimits,
    }).edit(data),
  );

export const withdrawPortalFeedbackDraft = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(({ data }) =>
    createPortalDraftManagement({
      feedback: createConfiguredFeedbackModule(),
      limits: feedbackSubmissionLimits,
    }).withdraw(data),
  );
