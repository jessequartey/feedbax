import { createPortalServerEntry } from "./portal-server-entry";
import { createConfiguredTrustedFeedbackHandler } from "./trusted-feedback-runtime";
import { env } from "cloudflare:workers";
import { createConfiguredFeedbackModule } from "./feedback-runtime";
import { createPortalVoteHandler } from "./portal-voting";
import { createCloudflareTurnstileVerifier } from "./cloudflare-turnstile";
import feedbax from "./feedbax";
import { ActionablePortalFailure } from "./safe-public-failure";
import { VoteEligibilityError } from "@feedbax/feedback";

export default createPortalServerEntry({
  voteHandler: async (request) => {
    try {
      const turnstileSecret = env.TURNSTILE_SECRET_KEY?.trim();
      const result = await createPortalVoteHandler({
        feedback: createConfiguredFeedbackModule(),
        votingEnabled: feedbax.features.voting,
        rateLimiter: env.PORTAL_SUBMISSIONS_RATE_LIMITER,
        rateLimitKey:
          request.headers.get("CF-Connecting-IP") ?? "unknown-participant-ip",
        ...(turnstileSecret
          ? {
              turnstileVerifier: createCloudflareTurnstileVerifier({
                secretKey: turnstileSecret,
              }),
              participationSigningSecret: env.PARTICIPATION_SIGNING_SECRET,
            }
          : {}),
      })(await request.json());
      return Response.json(result);
    } catch (error) {
      const actionable =
        error instanceof ActionablePortalFailure ||
        error instanceof VoteEligibilityError;
      return Response.json(
        {
          error: actionable
            ? error.message
            : "Public feedback mutation is temporarily unavailable.",
          code:
            error instanceof ActionablePortalFailure
              ? (error.code ?? "action_failed")
              : error instanceof VoteEligibilityError
                ? "ineligible_post"
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
  },
  trustedFeedbackHandler: async (request) => {
    try {
      return await createConfiguredTrustedFeedbackHandler()(request);
    } catch {
      return Response.json(
        { error: "Trusted submission is unavailable." },
        { status: 503 },
      );
    }
  },
});
