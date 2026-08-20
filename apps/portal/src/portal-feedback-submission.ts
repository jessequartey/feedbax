import type {
  BrowserCapability,
  FeedbackItem,
  FeedbackModule,
  SubmitFeedbackInput,
  SubmittedFeedbackItem,
} from "@feedbax/feedback";

import type { TurnstileVerifier } from "./cloudflare-turnstile";
import { ActionablePortalFailure } from "./safe-public-failure";

interface PortalFeedbackSubmissionOptions {
  feedback: Pick<FeedbackModule, "submit">;
  limits: {
    maxTitleLength: number;
    maxDescriptionLength: number;
  };
  rateLimiter: PortalSubmissionRateLimiter;
  rateLimitKey: string;
  turnstileVerifier?: TurnstileVerifier;
}

export interface PortalSubmissionRateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface PortalDraftManagementOptions {
  feedback: Pick<FeedbackModule, "editDraft" | "withdrawDraft">;
  limits: PortalFeedbackSubmissionOptions["limits"];
}

export function createPortalDraftManagement({
  feedback,
  limits,
}: PortalDraftManagementOptions): {
  edit(input: unknown): Promise<FeedbackItem>;
  withdraw(input: unknown): Promise<void>;
} {
  return {
    edit(input) {
      const draft = validateDraftIdentity(input);
      const value = input as Record<string, unknown>;
      if (
        !isBoundedRequiredText(value.title, limits.maxTitleLength) ||
        !isBoundedRequiredText(
          value.description,
          limits.maxDescriptionLength,
        ) ||
        !isFeedbackType(value.type)
      ) {
        throw invalidSubmission();
      }
      return feedback.editDraft({
        ...draft,
        title: value.title,
        description: value.description,
        type: value.type,
      });
    },
    withdraw(input) {
      return feedback.withdrawDraft(validateDraftIdentity(input));
    },
  };
}

export function createPortalFeedbackSubmission({
  feedback,
  limits,
  rateLimiter,
  rateLimitKey,
  turnstileVerifier,
}: PortalFeedbackSubmissionOptions): (
  input: unknown,
) => Promise<SubmittedFeedbackItem> {
  return async (input) => {
    const { success } = await rateLimiter.limit({ key: rateLimitKey });
    if (!success) {
      throw new ActionablePortalFailure(
        "Feedback submission rate limit exceeded.",
      );
    }
    if (turnstileVerifier) {
      await verifyTurnstile(input, rateLimitKey, turnstileVerifier);
    }
    return feedback.submit(validateInput(input, limits));
  };
}

async function verifyTurnstile(
  input: unknown,
  remoteIp: string,
  turnstileVerifier: TurnstileVerifier,
): Promise<void> {
  const token =
    input && typeof input === "object" && !Array.isArray(input)
      ? Reflect.get(input, "turnstileToken")
      : undefined;
  if (typeof token !== "string" || token.length === 0) {
    throw turnstileFailure();
  }

  const verified = await turnstileVerifier.verify({ token, remoteIp });
  if (!verified) throw turnstileFailure();
}

function turnstileFailure(): Error {
  return new ActionablePortalFailure(
    "Feedback submission verification failed.",
  );
}

function validateInput(
  input: unknown,
  limits: PortalFeedbackSubmissionOptions["limits"],
): SubmitFeedbackInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw invalidSubmission();
  }
  const value = input as Record<string, unknown>;
  if (
    !isBoundedRequiredText(value.title, limits.maxTitleLength) ||
    !isBoundedRequiredText(value.description, limits.maxDescriptionLength) ||
    !isFeedbackType(value.type)
  ) {
    throw invalidSubmission();
  }
  if (!isValidSubmitter(value.submitter)) throw invalidSubmission();

  return {
    title: value.title,
    description: value.description,
    type: value.type,
    ...(value.submitter ? { submitter: value.submitter } : {}),
  };
}

function validateDraftIdentity(input: unknown): {
  id: string;
  browserCapability: BrowserCapability;
} {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw invalidSubmission();
  }
  const value = input as Record<string, unknown>;
  if (
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    typeof value.browserCapability !== "string" ||
    value.browserCapability.length === 0
  ) {
    throw invalidSubmission();
  }
  return {
    id: value.id,
    browserCapability: value.browserCapability as BrowserCapability,
  };
}

function isBoundedRequiredText(
  value: unknown,
  maximum: number,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maximum
  );
}

function isFeedbackType(value: unknown): value is SubmitFeedbackInput["type"] {
  return (
    value === "Feature Request" ||
    value === "Bug Report" ||
    value === "General Feedback"
  );
}

function isValidSubmitter(
  value: unknown,
): value is SubmitFeedbackInput["submitter"] {
  if (value === undefined) return true;
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const submitter = value as Record<string, unknown>;
  return (
    (submitter.name === undefined || typeof submitter.name === "string") &&
    (submitter.email === undefined || typeof submitter.email === "string")
  );
}

function invalidSubmission(): Error {
  return new ActionablePortalFailure("Feedback submission is invalid.");
}
