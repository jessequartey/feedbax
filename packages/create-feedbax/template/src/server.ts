import { createMyFeedbackRequestHandler } from "./my-feedback-runtime";
import { createPublicHistoryRequestHandler } from "./history-runtime";
import { handleImageRequest } from "./images-runtime";
import {
  handleParticipationRequest,
  synchronizeConnectedUpdates,
} from "./participation-runtime";
import { handleConnectedRequest } from "./connected-runtime";
import { configuredTurnstileSecret } from "./turnstile-configuration";
import { createPortalServerEntry } from "./portal-server-entry";
import { createConfiguredTrustedFeedbackHandler } from "./trusted-feedback-runtime";
import { env } from "cloudflare:workers";
import {
  configuredIntegration,
  configuredHistory,
  createConfiguredContentFeedbackModule,
  createConfiguredFeedbackModule,
  requestParticipant,
} from "./feedback-runtime";
import { createPortalVoteHandler } from "./portal-voting";
import { createCloudflareTurnstileVerifier } from "./cloudflare-turnstile";
import feedbax from "./feedbax";
import { ActionablePortalFailure } from "./safe-public-failure";
import { VoteEligibilityError } from "@feedbax/feedback";
import {
  createPortalCommentMutationRequestHandler,
  createPortalCommentRequestHandler,
} from "./portal-comments";

const application = createPortalServerEntry({
  cachePublicReads: feedbax.provider !== "github" && !feedbax.history,
  connectedHandler: async (request) =>
    (await createPublicHistoryRequestHandler({
      enabled: Boolean(feedbax.history),
      history: feedbax.history ? configuredHistory() : undefined,
      rateLimit: async (input) =>
        (
          await env.TRUSTED_SUBMISSIONS_RATE_LIMITER.limit({
            key: `history:${input.headers.get("CF-Connecting-IP") ?? "unknown"}`,
          })
        ).success,
    })(request)) ??
    (feedbax.connected &&
    env.FEEDBAX_DB &&
    request.url.includes("/internal/my-feedback")
      ? await createMyFeedbackRequestHandler({
          enabled: true,
          siteUrl: feedbax.product.siteUrl!,
          database: env.FEEDBAX_DB,
          getParticipant: requestParticipant,
          getFeedback: createConfiguredFeedbackModule,
          rateLimit: async (input) =>
            (
              await env.TRUSTED_SUBMISSIONS_RATE_LIMITER.limit({
                key: `my-feedback:${input.headers.get("CF-Connecting-IP") ?? "unknown"}`,
              })
            ).success,
          limits: feedbax.submissions,
        })(request)
      : undefined) ??
    (feedbax.provider === "github"
      ? await configuredIntegration().handle(request)
      : undefined) ??
    (await handleImageRequest(request)) ??
    (await handleParticipationRequest(request)) ??
    handleConnectedRequest(request),
  commentHandler: (request) => {
    const turnstileSecret = configuredTurnstileSecret(env.TURNSTILE_SECRET_KEY);
    return createPortalCommentRequestHandler({
      feedback: createConfiguredFeedbackModule(),
      commentsEnabled: feedbax.features.comments,
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
      participationSigningSecret: env.PARTICIPATION_SIGNING_SECRET,
    })(request);
  },
  commentMutationHandler: (request) =>
    createPortalCommentMutationRequestHandler({
      feedback: createConfiguredFeedbackModule(),
      commentsEnabled: feedbax.features.comments,
      rateLimiter: env.PORTAL_SUBMISSIONS_RATE_LIMITER,
      rateLimitKey:
        request.headers.get("CF-Connecting-IP") ?? "unknown-participant-ip",
      ...(configuredTurnstileSecret(env.TURNSTILE_SECRET_KEY)
        ? {
            turnstileVerifier: createCloudflareTurnstileVerifier({
              secretKey: configuredTurnstileSecret(env.TURNSTILE_SECRET_KEY)!,
            }),
          }
        : {}),
      participationSigningSecret: env.PARTICIPATION_SIGNING_SECRET,
    })(request),
  voteHandler: async (request) => {
    try {
      const turnstileSecret = configuredTurnstileSecret(
        env.TURNSTILE_SECRET_KEY,
      );
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

export default {
  ...application,
  async scheduled() {
    if (feedbax.history) await configuredHistory().synchronize();
    if (feedbax.provider === "github")
      await configuredIntegration().reconcile(
        createConfiguredContentFeedbackModule(),
      );
    if (!feedbax.connected) return;
    if (feedbax.connected.processing === "standard") {
      await synchronizeConnectedUpdates();
      return;
    }
    if (!env.FEEDBAX_UPDATES)
      throw new Error(
        "Bind the Connected processing queue as FEEDBAX_UPDATES.",
      );
    await env.FEEDBAX_UPDATES.send("feedbax-connected-tick-v1");
  },
  async queue(
    batch: import("@cloudflare/workers-types").MessageBatch<unknown>,
  ) {
    if (!feedbax.connected || feedbax.connected.processing === "standard")
      throw new Error("Queue delivery requires small Connected processing.");
    for (const message of batch.messages) {
      if (message.body !== "feedbax-connected-tick-v1") {
        message.ack();
        continue;
      }
      await synchronizeConnectedUpdates();
      message.ack();
    }
  },
};
