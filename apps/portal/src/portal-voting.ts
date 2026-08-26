import { createHmac, timingSafeEqual } from "node:crypto";

import type { FeedbackModule, VoteResult } from "@feedbax/feedback";
import type { TurnstileVerifier } from "./cloudflare-turnstile";
import type { PortalSubmissionRateLimiter } from "./portal-feedback-submission";
import { ActionablePortalFailure } from "./safe-public-failure";

const participationPassLifetime = 30 * 60 * 1_000;

export interface PortalVoteResult extends VoteResult {
  participationPass?: string;
}

export function createPortalVoteHandler(options: {
  feedback: Pick<FeedbackModule, "changeVote">;
  votingEnabled: boolean;
  rateLimiter: PortalSubmissionRateLimiter;
  rateLimitKey: string;
  turnstileVerifier?: TurnstileVerifier;
  participationSigningSecret?: string;
  now?: () => number;
}) {
  return async (input: unknown): Promise<PortalVoteResult> => {
    if (!options.votingEnabled)
      throw new ActionablePortalFailure(
        "Voting is disabled for this Installation.",
        "voting_disabled",
      );
    const value = validateVoteInput(input);
    const { success } = await options.rateLimiter.limit({
      key: `vote:${options.rateLimitKey}`,
    });
    if (!success)
      throw new ActionablePortalFailure(
        "Vote rate limit exceeded. Try again shortly.",
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
            "Vote verification is required.",
            "verification_required",
          );
        const verified = await options.turnstileVerifier.verify({
          token: value.turnstileToken,
          remoteIp: options.rateLimitKey,
        });
        if (!verified)
          throw new ActionablePortalFailure(
            "Vote verification failed.",
            "verification_failed",
          );
        participationPass = issueParticipationPass(secret, now);
      }
    }

    const result = await options.feedback.changeVote(value);
    return { ...result, ...(participationPass ? { participationPass } : {}) };
  };
}

function validateVoteInput(input: unknown): {
  slug: string;
  intention: "add" | "remove";
  turnstileToken?: string;
  participationPass?: string;
} {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new ActionablePortalFailure(
      "Vote request is invalid.",
      "invalid_request",
    );
  const value = input as Record<string, unknown>;
  if (
    typeof value.slug !== "string" ||
    value.slug.length === 0 ||
    (value.intention !== "add" && value.intention !== "remove")
  )
    throw new ActionablePortalFailure(
      "Vote request is invalid.",
      "invalid_request",
    );
  return {
    slug: value.slug,
    intention: value.intention,
    ...(typeof value.turnstileToken === "string"
      ? { turnstileToken: value.turnstileToken }
      : {}),
    ...(typeof value.participationPass === "string"
      ? { participationPass: value.participationPass }
      : {}),
  };
}

export function requiredParticipationSigningSecret(secret?: string): string {
  if (!secret || secret.length < 32)
    throw new Error("Participation signing secret is missing or too short.");
  return secret;
}

export function issueParticipationPass(secret: string, now: number): string {
  const payload = Buffer.from(
    JSON.stringify({ expiresAt: now + participationPassLifetime }),
  ).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyParticipationPass(
  pass: string,
  secret: string,
  now: number,
): boolean {
  const [payload, signature, extra] = pass.split(".");
  if (!payload || !signature || extra) return false;
  const expected = Buffer.from(sign(payload, secret));
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
      typeof Reflect.get(value, "expiresAt") === "number" &&
      Reflect.get(value, "expiresAt") > now,
    );
  } catch {
    return false;
  }
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
