import {
  CommentEligibilityError,
  CommentValidationError,
  type CreatedComment,
  type FeedbackModule,
} from "@feedbax/feedback";

import type { TurnstileVerifier } from "./cloudflare-turnstile";
import type { PortalSubmissionRateLimiter } from "./portal-feedback-submission";
import {
  issueParticipationPass,
  requiredParticipationSigningSecret,
  verifyParticipationPass,
} from "./portal-voting";
import { ActionablePortalFailure } from "./safe-public-failure";

export interface PortalCommentResult {
  comment: CreatedComment;
  participationPass?: string;
}

export interface PortalCommentRequest {
  slug: string;
  body: string;
  displayName: string;
  discussionId?: string;
  turnstileToken?: string;
  participationPass?: string;
}

export function createPortalCommentHandler(options: {
  feedback: Pick<FeedbackModule, "createComment" | "replyToCommentThread">;
  commentsEnabled: boolean;
  rateLimiter: PortalSubmissionRateLimiter;
  rateLimitKey: string;
  turnstileVerifier?: TurnstileVerifier;
  participationSigningSecret?: string;
  now?: () => number;
}) {
  return async (input: unknown): Promise<PortalCommentResult> => {
    if (!options.commentsEnabled)
      throw new ActionablePortalFailure(
        "Comments are disabled for this Installation.",
        "comments_disabled",
      );
    const value = validateCommentInput(input);
    const { success } = await options.rateLimiter.limit({
      key: `comment:${options.rateLimitKey}`,
    });
    if (!success)
      throw new ActionablePortalFailure(
        "Comment rate limit exceeded. Try again shortly.",
        "rate_limited",
      );

    let participationPass: string | undefined;
    if (options.turnstileVerifier) {
      const secret = requiredParticipationSigningSecret(
        options.participationSigningSecret,
      );
      const now = options.now?.() ?? Date.now();
      if (
        !value.participationPass ||
        !verifyParticipationPass(value.participationPass, secret, now)
      ) {
        if (!value.turnstileToken)
          throw new ActionablePortalFailure(
            "Comment verification is required.",
            "verification_required",
          );
        const verified = await options.turnstileVerifier.verify({
          token: value.turnstileToken,
          remoteIp: options.rateLimitKey,
        });
        if (!verified)
          throw new ActionablePortalFailure(
            "Comment verification failed.",
            "verification_failed",
          );
        participationPass = issueParticipationPass(secret, now);
      }
    }

    const command = {
      slug: value.slug,
      body: value.body,
      displayName: value.displayName,
    };
    const comment = value.discussionId
      ? await options.feedback.replyToCommentThread({
          ...command,
          discussionId: value.discussionId,
        })
      : await options.feedback.createComment(command);
    return {
      comment,
      ...(participationPass ? { participationPass } : {}),
    };
  };
}

export function createPortalCommentRequestHandler(
  options: Parameters<typeof createPortalCommentHandler>[0],
) {
  const comment = createPortalCommentHandler(options);
  return async (request: Request): Promise<Response> => {
    try {
      return Response.json(await comment(await request.json()));
    } catch (error) {
      const actionable =
        error instanceof ActionablePortalFailure ||
        error instanceof CommentEligibilityError ||
        error instanceof CommentValidationError;
      return Response.json(
        {
          error: actionable
            ? error.message
            : "Comment could not be saved. Try again.",
          code:
            error instanceof ActionablePortalFailure
              ? (error.code ?? "action_failed")
              : error instanceof CommentEligibilityError
                ? "ineligible_post"
                : error instanceof CommentValidationError
                  ? "invalid_request"
                  : "temporarily_unavailable",
        },
        {
          status:
            error instanceof ActionablePortalFailure &&
            error.code === "rate_limited"
              ? 429
              : actionable
                ? 400
                : 503,
        },
      );
    }
  };
}

function validateCommentInput(input: unknown): PortalCommentRequest {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw invalidCommentRequest();
  const value = input as Record<string, unknown>;
  if (typeof value.slug !== "string" || !value.slug.trim())
    throw invalidCommentRequest();
  if (typeof value.body !== "string" || !value.body.trim())
    throw new ActionablePortalFailure(
      "Comment text is required.",
      "invalid_request",
    );
  if (typeof value.displayName !== "string" || !value.displayName.trim())
    throw new ActionablePortalFailure(
      "Device Profile display name is required before commenting.",
      "profile_required",
    );
  return {
    slug: value.slug,
    body: value.body,
    displayName: value.displayName,
    ...(typeof value.discussionId === "string" && value.discussionId
      ? { discussionId: value.discussionId }
      : {}),
    ...(typeof value.turnstileToken === "string"
      ? { turnstileToken: value.turnstileToken }
      : {}),
    ...(typeof value.participationPass === "string"
      ? { participationPass: value.participationPass }
      : {}),
  };
}

function invalidCommentRequest() {
  return new ActionablePortalFailure(
    "Comment request is invalid.",
    "invalid_request",
  );
}
