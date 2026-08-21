import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";

import {
  createConfiguredFeedbackModule,
  feedbackSubmissionLimits,
} from "./feedback-runtime";
import {
  createPortalDraftManagement,
  createPortalFeedbackSubmission,
  createPortalPostSubmission,
} from "./portal-feedback-submission";
import {
  createPortalSubmissionSecurity,
  warnIfTurnstileDisabled,
} from "./portal-feedback-runtime";
import { runSafePortalMutation } from "./safe-public-failure";

export const submitPortalFeedback = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) => {
    const { env } = await import("cloudflare:workers");
    warnIfTurnstileDisabled({
      environment: env,
      nodeEnv: import.meta.env.PROD ? "production" : "development",
    });
    return runSafePortalMutation(() =>
      createPortalFeedbackSubmission({
        feedback: createConfiguredFeedbackModule(),
        limits: feedbackSubmissionLimits,
        ...createPortalSubmissionSecurity({
          environment: env,
          rateLimitKey: getRequestIP() ?? "unknown-participant-ip",
        }),
      })(data),
    );
  });

export const submitPortalPost = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(async ({ data }) => {
    const { env } = await import("cloudflare:workers");
    return runSafePortalMutation(() =>
      createPortalPostSubmission({
        feedback: createConfiguredFeedbackModule(),
        limits: feedbackSubmissionLimits,
        ...createPortalSubmissionSecurity({
          environment: env,
          rateLimitKey: getRequestIP() ?? "unknown-participant-ip",
        }),
      })(data),
    );
  });

export const editPortalFeedbackDraft = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(({ data }) =>
    runSafePortalMutation(() =>
      createPortalDraftManagement({
        feedback: createConfiguredFeedbackModule(),
        limits: feedbackSubmissionLimits,
      }).edit(data),
    ),
  );

export const withdrawPortalFeedbackDraft = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(({ data }) =>
    runSafePortalMutation(() =>
      createPortalDraftManagement({
        feedback: createConfiguredFeedbackModule(),
        limits: feedbackSubmissionLimits,
      }).withdraw(data),
    ),
  );

export const getPortalDraftPost = createServerFn({ method: "POST" })
  .validator((input: unknown) => input)
  .handler(({ data }) => {
    if (!data || typeof data !== "object")
      throw new Error("Draft Post request is invalid.");
    const id = Reflect.get(data, "id");
    const browserCapability = Reflect.get(data, "browserCapability");
    if (typeof id !== "string" || typeof browserCapability !== "string")
      throw new Error("Draft Post request is invalid.");
    return runSafePortalMutation(() =>
      createConfiguredFeedbackModule().getDraftPost({
        id,
        browserCapability:
          browserCapability as import("@feedbax/feedback").BrowserCapability,
      }),
    );
  });
