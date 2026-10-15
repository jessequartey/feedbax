import {
  createEmailSender,
  createParticipationModule,
  type VerifiedParticipant,
} from "@feedbax/feedback";
import { env } from "cloudflare:workers";
import feedbax from "./feedbax";
import {
  configuredImages,
  createConfiguredNotionFeedbackModule,
  getConnectedStore,
} from "./feedback-runtime";
import {
  readSessionToken,
  sameOrigin,
  sessionHash,
} from "./connected-identity";

type ParticipationModule = ReturnType<typeof createParticipationModule>;
const paths = new Set([
  "follow",
  "notifications",
  "preferences",
  "unsubscribe",
]);
export function createParticipationRequestHandler(options: {
  siteUrl: string;
  enabled: boolean;
  getParticipant(request: Request): Promise<VerifiedParticipant | undefined>;
  getModule(participant?: VerifiedParticipant): ParticipationModule;
  rateLimit(request: Request): Promise<boolean>;
}) {
  return async (request: Request): Promise<Response | undefined> => {
    const url = new URL(request.url);
    const route = url.pathname.replace("/internal/connected/", "");
    if (!url.pathname.startsWith("/internal/connected/") || !paths.has(route))
      return;
    const json = (body: unknown, status = 200) =>
      Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
    if (!options.enabled) return json({ error: "Not found." }, 404);
    if (!["GET", "POST"].includes(request.method))
      return json({ error: "Method not allowed." }, 405);
    if (
      route !== "unsubscribe" &&
      request.method !== "GET" &&
      !sameOrigin(request, options.siteUrl)
    )
      return json({ error: "Request origin is invalid." }, 403);
    try {
      if (route === "unsubscribe") {
        const token = url.searchParams.get("token") ?? "";
        if (!/^[a-f0-9]{32}\.[A-Za-z0-9_-]{43}$/.test(token))
          return json({ error: "Invalid unsubscribe link." }, 400);
        if (request.method === "GET")
          return new Response(null, {
            status: 303,
            headers: {
              Location: `/email-preferences?token=${encodeURIComponent(token)}`,
              "Cache-Control": "no-store",
              "Referrer-Policy": "no-referrer",
            },
          });
        if (!(await options.rateLimit(request)))
          return json({ error: "Try again shortly." }, 429);
        await options.getModule().unsubscribe(token);
        return new Response(
          "Email notifications are turned off. You can turn them on again in Feedbax.",
          {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-store",
            },
          },
        );
      }
      const participant = await options.getParticipant(request);
      if (!participant)
        return json(
          {
            error: "Sign in through the product to continue.",
            code: "sign_in_required",
          },
          401,
        );
      const module = options.getModule(participant);
      if (request.method === "GET") {
        if (route === "follow")
          return json(
            await module.followState(url.searchParams.get("slug") ?? ""),
          );
        if (route === "notifications")
          return json(
            await module.inbox(url.searchParams.get("cursor") ?? undefined),
          );
        if (route === "preferences") return json(await module.preferences());
      }
      if (!(await options.rateLimit(request)))
        return json({ error: "Too many changes. Try again shortly." }, 429);
      if (Number(request.headers.get("Content-Length")) > 4096)
        return json({ error: "Request is too large." }, 413);
      const reader = request.body?.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      if (reader)
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > 4096) {
            await reader.cancel();
            return json({ error: "Request is too large." }, 413);
          }
          chunks.push(value);
        }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const text = new TextDecoder().decode(bytes);
      if (text.length > 4096)
        return json({ error: "Request is too large." }, 413);
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(text);
      } catch {
        return json({ error: "Invalid request." }, 400);
      }
      if (!body || typeof body !== "object" || Array.isArray(body))
        return json({ error: "Invalid request." }, 400);
      if (
        route === "follow" &&
        typeof body.slug === "string" &&
        body.slug.length <= 512 &&
        typeof body.following === "boolean"
      )
        return json(await module.follow(body.slug, body.following));
      if (
        route === "notifications" &&
        (body.id === undefined ||
          (typeof body.id === "string" && /^[a-f0-9]{32}$/.test(body.id)))
      ) {
        await module.markRead(body.id as string | undefined);
        return json({ updated: true });
      }
      if (route === "preferences" && typeof body.emailEnabled === "boolean") {
        await module.setEmailPreference(body.emailEnabled);
        return json(await module.preferences());
      }
      return json({ error: "Invalid request." }, 400);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const known = [
        "Post is unavailable.",
        "Invalid notification cursor.",
        "Invalid unsubscribe link.",
        "Email notifications require a verified application email and a configured sender.",
      ];
      return json(
        {
          error: known.includes(message)
            ? message
            : "Updates are temporarily unavailable. Try again.",
        },
        message === "Post is unavailable."
          ? 404
          : known.includes(message)
            ? 400
            : 503,
      );
    }
  };
}

export function configuredParticipation(participant?: VerifiedParticipant) {
  return createConfiguredParticipation(
    createConfiguredNotionFeedbackModule(),
    participant,
  );
}

function createConfiguredParticipation(
  feedback: import("@feedbax/feedback").FeedbackModule,
  participant?: VerifiedParticipant,
) {
  if (!feedbax.connected || !env.FEEDBAX_DB)
    throw new Error("Connected database is missing.");
  const config = feedbax.connected.email;
  let email: Parameters<typeof createParticipationModule>[0]["email"];
  if (config) {
    const sender =
      config.provider === "cloudflare"
        ? createEmailSender({
            provider: "cloudflare",
            binding: requireBinding(env.FEEDBAX_EMAIL),
          })
        : config.provider === "resend"
          ? createEmailSender({
              provider: "resend",
              token: env.EMAIL_PROVIDER_SECRET ?? "",
            })
          : createEmailSender({
              provider: "custom",
              url: config.endpoint!,
              token: env.EMAIL_PROVIDER_SECRET ?? "",
            });
    email = {
      sender,
      from: config.from,
      siteUrl: feedbax.product.siteUrl!,
      unsubscribeSecret: env.PARTICIPATION_SIGNING_SECRET ?? "",
    };
  }
  return createParticipationModule({
    database: env.FEEDBAX_DB,
    feedback,
    participant,
    processing: feedbax.connected.processing ?? "small",
    email,
  });
}
const requireBinding = <T>(value: T | undefined): T => {
  if (!value) throw new Error("Email binding is missing.");
  return value;
};
export const handleParticipationRequest = createParticipationRequestHandler({
  enabled: Boolean(feedbax.connected),
  siteUrl: feedbax.product.siteUrl ?? "https://not-configured.invalid",
  getParticipant: async (request) => {
    const token = readSessionToken(request);
    return token ? getConnectedStore().session(sessionHash(token)) : undefined;
  },
  getModule: configuredParticipation,
  rateLimit: async (request) =>
    (
      await env.PORTAL_SUBMISSIONS_RATE_LIMITER.limit({
        key: `updates:${request.headers.get("CF-Connecting-IP") ?? "unknown"}`,
      })
    ).success,
});
export async function synchronizeConnectedUpdates() {
  if (!feedbax.connected) return;
  const content = createConfiguredNotionFeedbackModule();
  const module = createConfiguredParticipation(content);
  const observation = await module.synchronize();
  const email = await module.deliverEmails();
  if (feedbax.connected.images) await configuredImages(content).cleanup();
  // Counts only: never log identities, addresses, provider responses, or message bodies.
  if (observation.failed || email.failed)
    console.warn("Connected update processing will retry", {
      observations: observation.failed,
      deliveries: email.failed,
    });
}
