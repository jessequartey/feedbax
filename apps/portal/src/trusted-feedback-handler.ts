import { createHash, timingSafeEqual } from "node:crypto";

import type { FeedbackModule } from "@feedbax/feedback";
import type {
  FeedbackType,
  SubmitTrustedFeedbackInput,
} from "@feedbax/feedback";

const FIXED_TRUSTED_SUBMISSION_BOUNDS = {
  submitterName: 200,
  submitterEmail: 320,
  idempotencyKey: 200,
  bodyBytes: 16 * 1_024,
} as const;

export interface TrustedSubmissionRateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface TrustedFeedbackHandlerOptions {
  apiKeyHash: string;
  feedback: Pick<FeedbackModule, "submitTrusted">;
  rateLimiter: TrustedSubmissionRateLimiter;
  limits: {
    maxTitleLength: number;
    maxDescriptionLength: number;
  };
}

export function createTrustedFeedbackHandler({
  apiKeyHash,
  feedback,
  rateLimiter,
  limits,
}: TrustedFeedbackHandlerOptions): (request: Request) => Promise<Response> {
  return async (request) => {
    if (!hasValidBearerKey(request.headers.get("Authorization"), apiKeyHash)) {
      return jsonResponse(401, { error: "Unauthorized trusted submission." });
    }

    try {
      const { success } = await rateLimiter.limit({ key: apiKeyHash });
      if (!success) {
        return jsonResponse(429, {
          error: "Trusted submission rate limit exceeded.",
        });
      }
    } catch {
      return jsonResponse(503, { error: "Trusted submission is unavailable." });
    }

    const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();
    if (!idempotencyKey) {
      return jsonResponse(400, {
        error: "Idempotency-Key header is required.",
      });
    }
    if (
      idempotencyKey.length > FIXED_TRUSTED_SUBMISSION_BOUNDS.idempotencyKey
    ) {
      return boundsError();
    }

    const input = await readTrustedSubmission(request, idempotencyKey, limits);
    if (input instanceof Response) return input;

    try {
      const item = await feedback.submitTrusted(input);
      return jsonResponse(200, item);
    } catch {
      return jsonResponse(502, { error: "Trusted submission failed." });
    }
  };
}

async function readTrustedSubmission(
  request: Request,
  externalId: string,
  limits: TrustedFeedbackHandlerOptions["limits"],
): Promise<SubmitTrustedFeedbackInput | Response> {
  let body: unknown;
  try {
    const text = await request.text();
    if (
      new TextEncoder().encode(text).byteLength >
      FIXED_TRUSTED_SUBMISSION_BOUNDS.bodyBytes
    ) {
      return boundsError();
    }
    body = JSON.parse(text) as unknown;
  } catch {
    return jsonResponse(400, { error: "Request body must be valid JSON." });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse(400, { error: "Request body is invalid." });
  }
  const value = body as Record<string, unknown>;
  if (
    typeof value.title !== "string" ||
    typeof value.description !== "string" ||
    !isFeedbackType(value.type)
  ) {
    return jsonResponse(400, { error: "Request body is invalid." });
  }
  if (
    !hasBoundedRequiredText(value.title, limits.maxTitleLength) ||
    !hasBoundedRequiredText(value.description, limits.maxDescriptionLength)
  ) {
    return boundsError();
  }
  const submitter = readSubmitter(value.submitter);
  if (submitter instanceof Response) return submitter;
  return {
    externalId,
    title: value.title,
    description: value.description,
    type: value.type,
    ...(submitter ? { submitter } : {}),
  };
}

function readSubmitter(
  value: unknown,
): SubmitTrustedFeedbackInput["submitter"] | Response {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return jsonResponse(400, { error: "Request body is invalid." });
  }
  const submitter = value as Record<string, unknown>;
  if (
    (submitter.name !== undefined && typeof submitter.name !== "string") ||
    (submitter.email !== undefined && typeof submitter.email !== "string")
  ) {
    return jsonResponse(400, { error: "Request body is invalid." });
  }
  if (
    (typeof submitter.name === "string" &&
      submitter.name.length > FIXED_TRUSTED_SUBMISSION_BOUNDS.submitterName) ||
    (typeof submitter.email === "string" &&
      submitter.email.length > FIXED_TRUSTED_SUBMISSION_BOUNDS.submitterEmail)
  ) {
    return boundsError();
  }
  return {
    ...(typeof submitter.name === "string" ? { name: submitter.name } : {}),
    ...(typeof submitter.email === "string" ? { email: submitter.email } : {}),
  };
}

function hasBoundedRequiredText(value: string, maximum: number): boolean {
  return value.trim().length > 0 && value.length <= maximum;
}

function boundsError(): Response {
  return jsonResponse(400, {
    error: "Trusted submission exceeds an accepted bound.",
  });
}

function isFeedbackType(value: unknown): value is FeedbackType {
  return (
    value === "Feature Request" ||
    value === "Bug Report" ||
    value === "General Feedback"
  );
}

function hasValidBearerKey(
  authorization: string | null,
  expectedApiKeyHash: string,
): boolean {
  if (!authorization?.startsWith("Bearer ")) return false;
  const presentedApiKey = authorization.slice("Bearer ".length);
  const expectedHash = Buffer.from(expectedApiKeyHash, "base64url");
  const presentedHash = createHash("sha256").update(presentedApiKey).digest();
  return (
    expectedHash.length === presentedHash.length &&
    timingSafeEqual(expectedHash, presentedHash)
  );
}

function jsonResponse(status: number, body: unknown): Response {
  return Response.json(body, { status });
}
