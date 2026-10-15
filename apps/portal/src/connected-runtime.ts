import { ActionablePortalFailure } from "./safe-public-failure";
import { VoteEligibilityError } from "@feedbax/feedback";
import type { FeedbaxConfig } from "@feedbax/config";
import type {
  ConnectedStore,
  FeedbackModule,
  VerifiedParticipant,
} from "@feedbax/feedback";
import { env } from "cloudflare:workers";
import feedbax from "./feedbax";
import {
  createConfiguredFeedbackModule,
  getConnectedStore,
} from "./feedback-runtime";
import {
  createConnectedIdentityHandler,
  readSessionToken,
  sameOrigin,
  sessionHash,
} from "./connected-identity";
import { createPortalVoteHandler } from "./portal-voting";
import {
  createPortalCommentRequestHandler,
  createPortalCommentMutationRequestHandler,
} from "./portal-comments";
import { createPortalSubmissionSecurity } from "./portal-feedback-runtime";

type ConnectedEnvironment = Parameters<
  typeof createPortalSubmissionSecurity
>[0]["environment"] & {
  IDENTITY_HANDOFF_SECRET?: string;
  PARTICIPATION_SIGNING_SECRET?: string;
};
export function createConnectedRequestHandler(options: {
  config: FeedbaxConfig;
  environment: ConnectedEnvironment;
  getStore: () => ConnectedStore;
  getFeedback: (participant: VerifiedParticipant) => FeedbackModule;
}) {
  const { config: feedbax, environment: env } = options;
  return async (request: Request): Promise<Response | undefined> => {
    const url = new URL(request.url);
    const identity = url.pathname.startsWith("/internal/identity/");
    const voteState = url.pathname === "/internal/connected/votes";
    const mutation =
      url.pathname === "/internal/votes" ||
      url.pathname === "/internal/comments";
    if (!identity && !voteState && !mutation) return;
    const json = (value: unknown, status = 200) =>
      Response.json(value, {
        status,
        headers: { "Cache-Control": "no-store" },
      });
    if (!feedbax.connected)
      return identity || voteState
        ? json({ error: "Not found." }, 404)
        : undefined;
    try {
      const store = options.getStore();
      const siteUrl = feedbax.product.siteUrl!;
      if (identity) {
        if (
          url.pathname !== "/internal/identity/session" &&
          !(
            await env.PORTAL_SUBMISSIONS_RATE_LIMITER.limit({
              key: `identity:${url.pathname}:${request.headers.get("CF-Connecting-IP") ?? "unknown"}`,
            })
          ).success
        )
          return json(
            { error: "Too many sign-in attempts. Try again shortly." },
            429,
          );
        if (
          !env.IDENTITY_HANDOFF_SECRET ||
          env.IDENTITY_HANDOFF_SECRET.length < 32
        )
          throw new Error("Missing identity secret.");
        return createConnectedIdentityHandler({
          ...feedbax.connected,
          siteUrl,
          secret: env.IDENTITY_HANDOFF_SECRET,
          store,
        })(request);
      }
      if (mutation && !sameOrigin(request, siteUrl))
        return json({ error: "Request origin is invalid." }, 403);
      if (mutation && !["POST", "PATCH", "DELETE"].includes(request.method))
        return json({ error: "Method not allowed." }, 405);
      const token = readSessionToken(request);
      const participant = token
        ? await store.session(sessionHash(token))
        : undefined;
      if (!participant)
        return json(
          {
            error: "Sign in through the product to participate.",
            code: "sign_in_required",
          },
          401,
        );
      const feedback = options.getFeedback(participant);
      if (voteState && request.method === "GET") {
        const slug = url.searchParams.get("slug") ?? "";
        const post = await feedback.getPublicPost(slug);
        if (!feedbax.features.voting || !post)
          return json({ error: "Post is unavailable." }, 404);
        return json(await store.voteState(slug, participant.subject));
      }
      const security = createPortalSubmissionSecurity({
        turnstile: feedbax.turnstile,
        environment: env,
        rateLimitKey:
          request.headers.get("CF-Connecting-IP") ?? "unknown-participant-ip",
      });
      const mutationOptions = {
        feedback,
        ...security,
        participationSigningSecret: env.PARTICIPATION_SIGNING_SECRET,
      };
      if (url.pathname === "/internal/votes" && request.method === "POST")
        return json(
          await createPortalVoteHandler({
            ...mutationOptions,
            votingEnabled: feedbax.features.voting,
          })(await request.json()),
        );
      if (url.pathname === "/internal/comments" && request.method === "POST")
        return noStore(
          createPortalCommentRequestHandler({
            ...mutationOptions,
            verifiedParticipant: participant,
            commentsEnabled: feedbax.features.comments,
          })(request),
        );
      if (
        url.pathname === "/internal/comments" &&
        (request.method === "PATCH" || request.method === "DELETE")
      )
        return noStore(
          createPortalCommentMutationRequestHandler({
            ...mutationOptions,
            commentsEnabled: feedbax.features.comments,
          })(request),
        );
      return json({ error: "Method not allowed." }, 405);
    } catch (error) {
      if (error instanceof ActionablePortalFailure)
        return json(
          { error: error.message, code: error.code ?? "action_failed" },
          error.code === "rate_limited" ? 429 : 400,
        );
      if (error instanceof VoteEligibilityError)
        return json({ error: error.message, code: "ineligible_post" }, 400);
      return json(
        {
          error:
            "Connected participation is temporarily unavailable. Try again.",
        },
        503,
      );
    }
  };
}
export const handleConnectedRequest = createConnectedRequestHandler({
  config: feedbax,
  environment: env,
  getStore: getConnectedStore,
  getFeedback: createConfiguredFeedbackModule,
});

async function noStore(response: Promise<Response>) {
  const result = await response;
  result.headers.set("Cache-Control", "no-store");
  return result;
}
