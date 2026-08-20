import { env } from "cloudflare:workers";

import {
  createConfiguredFeedbackModule,
  feedbackSubmissionLimits,
  requiredEnvironmentValue,
} from "./feedback-runtime";
import { createTrustedFeedbackHandler } from "./trusted-feedback-handler";

export function createConfiguredTrustedFeedbackHandler() {
  return createTrustedFeedbackHandler({
    apiKeyHash: requiredEnvironmentValue("FEEDBAX_API_KEY_HASH"),
    rateLimiter: env.TRUSTED_SUBMISSIONS_RATE_LIMITER,
    limits: feedbackSubmissionLimits,
    feedback: createConfiguredFeedbackModule(),
  });
}
