import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";

import {
  createConfiguredFeedbackModule,
  feedbackSubmissionLimits,
} from "./feedback-runtime";
import { createPortalFeedbackSubmission } from "./portal-feedback-submission";
import {
  createPortalSubmissionSecurity,
  warnIfTurnstileDisabled,
} from "./portal-feedback-runtime";

const nodeEnv = import.meta.env.PROD ? "production" : "development";

warnIfTurnstileDisabled({ environment: env, nodeEnv });

export const submitPortalFeedback = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(({ data }) =>
    createPortalFeedbackSubmission({
      feedback: createConfiguredFeedbackModule(),
      limits: feedbackSubmissionLimits,
      ...createPortalSubmissionSecurity({
        environment: env,
        rateLimitKey: getRequestIP() ?? "unknown-participant-ip",
      }),
    })(data),
  );
