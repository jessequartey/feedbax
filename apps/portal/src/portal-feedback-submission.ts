import type {
  FeedbackModule,
  SubmitFeedbackInput,
  SubmittedFeedbackItem,
} from "@feedbax/feedback";

interface PortalFeedbackSubmissionOptions {
  feedback: Pick<FeedbackModule, "submit">;
  limits: {
    maxTitleLength: number;
    maxDescriptionLength: number;
  };
}

export function createPortalFeedbackSubmission({
  feedback,
  limits,
}: PortalFeedbackSubmissionOptions): (
  input: unknown,
) => Promise<SubmittedFeedbackItem> {
  return async (input) => feedback.submit(validateInput(input, limits));
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
  return new Error("Feedback submission is invalid.");
}
