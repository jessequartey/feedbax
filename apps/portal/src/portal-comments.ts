import {
  CommentEligibilityError,
  CommentValidationError,
  type CreatedComment,
  type FeedbackModule,
} from "@feedbax/feedback";
import { createHmac, timingSafeEqual } from "node:crypto";

import type { TurnstileVerifier } from "./cloudflare-turnstile";
import type { PortalSubmissionRateLimiter } from "./portal-feedback-submission";
import {
  issueParticipationPass,
  requiredParticipationSigningSecret,
  verifyParticipationPass,
} from "./portal-voting";
import { ActionablePortalFailure } from "./safe-public-failure";
import { isValidCommentEmail } from "./comment-profile";

export interface PortalCommentResult {
  comment: CreatedComment;
  commentCapability: string;
  commentCapabilityExpiresAt: number;
  participationPass?: string;
}

const commentCapabilityLifetime = 15 * 60 * 1_000;

export interface PortalCommentRequest {
  slug: string;
  body: string;
  displayName: string;
  email: string;
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
    const capabilitySecret = requiredParticipationSigningSecret(
      options.participationSigningSecret,
    );
    const capabilityExpiresAt =
      comment.createdAt.getTime() + commentCapabilityLifetime;
    return {
      comment,
      commentCapability: issueCommentCapability(
        comment.id,
        capabilitySecret,
        capabilityExpiresAt,
      ),
      commentCapabilityExpiresAt: capabilityExpiresAt,
      ...(participationPass ? { participationPass } : {}),
    };
  };
}

export function createPortalCommentMutationHandler(options: {
  feedback: Pick<FeedbackModule, "editComment" | "deleteComment">;
  commentsEnabled: boolean;
  rateLimiter: PortalSubmissionRateLimiter;
  rateLimitKey: string;
  turnstileVerifier?: TurnstileVerifier;
  participationSigningSecret?: string;
  now?: () => number;
}) {
  return async (input: unknown) => {
    if (!options.commentsEnabled) throw invalidCommentCapability();
    const value = validateCommentMutationInput(input);
    const secret = requiredParticipationSigningSecret(
      options.participationSigningSecret,
    );
    const { success } = await options.rateLimiter.limit({
      key: `comment:${options.rateLimitKey}`,
    });
    if (!success)
      throw new ActionablePortalFailure(
        "Comment rate limit exceeded. Try again shortly.",
        "rate_limited",
      );
    if (
      options.turnstileVerifier &&
      (!value.participationPass ||
        !verifyParticipationPass(
          value.participationPass,
          secret,
          options.now?.() ?? Date.now(),
        ))
    )
      throw new ActionablePortalFailure(
        "Comment verification is required.",
        "verification_required",
      );
    if (
      !verifyCommentCapability(
        value.commentCapability,
        value.commentId,
        value.action,
        secret,
        options.now?.() ?? Date.now(),
      )
    )
      throw invalidCommentCapability();
    try {
      if (value.action === "delete") {
        await options.feedback.deleteComment({ commentId: value.commentId });
        return { deleted: true as const };
      }
      return {
        comment: await options.feedback.editComment({
          commentId: value.commentId,
          body: value.body,
        }),
      };
    } catch {
      throw new ActionablePortalFailure(
        "Comment is no longer available to change. Refresh the discussion and try again.",
        "comment_unavailable",
      );
    }
  };
}

function issueCommentCapability(
  commentId: string,
  secret: string,
  expiresAt: number,
) {
  const payload = Buffer.from(
    JSON.stringify({
      commentId,
      actions: ["edit", "delete"],
      expiresAt,
    }),
  ).toString("base64url");
  return `${payload}.${signCommentCapability(payload, secret)}`;
}

function verifyCommentCapability(
  capability: string,
  commentId: string,
  action: "edit" | "delete",
  secret: string,
  now: number,
) {
  const [payload, signature, extra] = capability.split(".");
  if (!payload || !signature || extra) return false;
  const expected = Buffer.from(signCommentCapability(payload, secret));
  const received = Buffer.from(signature);
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  )
    return false;
  try {
    const value: unknown = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    );
    return Boolean(
      value &&
      typeof value === "object" &&
      Reflect.get(value, "commentId") === commentId &&
      Array.isArray(Reflect.get(value, "actions")) &&
      (Reflect.get(value, "actions") as unknown[]).includes(action) &&
      typeof Reflect.get(value, "expiresAt") === "number" &&
      (Reflect.get(value, "expiresAt") as number) > now,
    );
  } catch {
    return false;
  }
}

function signCommentCapability(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function validateCommentMutationInput(input: unknown): {
  action: "edit" | "delete";
  commentId: string;
  commentCapability: string;
  body: string;
  participationPass?: string;
} {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw invalidCommentCapability();
  const value = input as Record<string, unknown>;
  if (
    (value.action !== "edit" && value.action !== "delete") ||
    typeof value.commentId !== "string" ||
    !value.commentId ||
    typeof value.commentCapability !== "string" ||
    !value.commentCapability ||
    (value.action === "edit" &&
      (typeof value.body !== "string" || !value.body.trim()))
  )
    throw invalidCommentCapability();
  return {
    action: value.action as "edit" | "delete",
    commentId: value.commentId,
    commentCapability: value.commentCapability,
    body: typeof value.body === "string" ? value.body.trim() : "",
    ...(typeof value.participationPass === "string"
      ? { participationPass: value.participationPass }
      : {}),
  };
}

function invalidCommentCapability() {
  return new ActionablePortalFailure(
    "Comment could not be changed with this capability.",
    "invalid_comment_capability",
  );
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

export function createPortalCommentMutationRequestHandler(
  options: Parameters<typeof createPortalCommentMutationHandler>[0],
) {
  const mutate = createPortalCommentMutationHandler(options);
  return async (request: Request): Promise<Response> => {
    try {
      return Response.json(await mutate(await request.json()));
    } catch (error) {
      const actionable = error instanceof ActionablePortalFailure;
      return Response.json(
        {
          error: actionable
            ? error.message
            : "Comment could not be changed. Try again.",
          code: actionable
            ? (error.code ?? "action_failed")
            : "temporarily_unavailable",
        },
        { status: actionable ? 400 : 503 },
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
  if (!isValidCommentEmail(value.email))
    throw new ActionablePortalFailure(
      "A Device Profile with a valid email is required before commenting.",
      "profile_required",
    );
  return {
    slug: value.slug.trim(),
    body: value.body.trim(),
    displayName: value.displayName.trim(),
    email: value.email.trim(),
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
