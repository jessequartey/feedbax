import { env } from "cloudflare:workers";
import { inArray } from "drizzle-orm";
import config from "../../feedbax.config.ts";
import { boundedBody, MULTIPART_BYTES, requireSameOrigin } from "./request.ts";
import type { ErrorCode } from "../contracts/domain.ts";
import { createDb } from "../db/client.ts";
import { syncState } from "../db/schema.ts";
import { createAuth, publicConfig } from "./auth.ts";
import { consumeHostToken, resolveHostUser, verifyHostToken } from "./host-token.ts";
import { createPostForUser } from "./posts.ts";
import type { Operation } from "./errors.ts";
import { apiError, DomainError, reportUnexpected } from "./errors.ts";

const STATUS: Record<ErrorCode, number> = {
  invalid_input: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  too_large: 413,
  unsupported_image: 415,
  rate_limited: 429,
  unavailable: 503,
};
export function errorResponse(error: unknown, operation: Operation = "request") {
  const correlationId = crypto.randomUUID();
  const body = apiError(error, operation, correlationId);
  return Response.json(
    { error: body },
    {
      status: STATUS[body.code],
      headers: {
        "Cache-Control": "no-store",
        "X-Request-ID": correlationId,
        ...(error instanceof DomainError && error.retryAfter
          ? { "Retry-After": String(error.retryAfter) }
          : {}),
      },
    },
  );
}
export function allowedOrigin(origin: string, settings = config): boolean {
  try {
    const parsed = new URL(origin);
    if (parsed.origin !== origin) return false;
    if (settings.appUrl && origin === new URL(settings.appUrl).origin) return true;
    return (
      new URL(env.PORTAL_URL).protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname) &&
      parsed.hostname === new URL(env.PORTAL_URL).hostname &&
      parsed.protocol === "http:"
    );
  } catch {
    return false;
  }
}
async function multipart(request: Request) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;"))
    throw new DomainError("invalid_input", "Use multipart form data.");
  try {
    return await new Response(await boundedBody(request, MULTIPART_BYTES), {
      headers: { "Content-Type": request.headers.get("content-type")! },
    }).formData();
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("invalid_input", "Invalid multipart form data.");
  }
}

export async function handlePosts(request: Request, settings = config): Promise<Response> {
  const origin = request.headers.get("origin");
  const cors = origin !== null && allowedOrigin(origin, settings);
  let response: Response;
  try {
    if (origin && !cors) throw new DomainError("forbidden", "This origin is not allowed.");
    if (request.method === "OPTIONS") response = new Response(null, { status: 204 });
    else {
      const authorization = request.headers.get("authorization");
      if (!authorization?.startsWith("Bearer "))
        throw new DomainError("unauthenticated", "A host token is required.");
      const claims = await verifyHostToken(authorization.slice(7));
      await consumeHostToken(claims);
      // Cookies are intentionally never forwarded to Better Auth by this endpoint.
      const user = await resolveHostUser(
        claims,
        (await createAuth(settings).$context).internalAdapter,
      );
      const result = await createPostForUser(
        await multipart(request),
        { id: user.id, name: user.name, kind: "host" },
        settings,
      );
      response = Response.json(result.data, {
        status: result.status,
        headers: { "Cache-Control": "no-store" },
      });
    }
  } catch (error) {
    response = errorResponse(error, "posts.create");
  }
  response.headers.set("Vary", "Origin");
  if (cors) {
    response.headers.set("Access-Control-Allow-Origin", origin!);
    response.headers.set("Access-Control-Allow-Methods", "POST");
    response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    // The block runs cross-origin; without this it cannot read Retry-After on a 429.
    response.headers.set("Access-Control-Expose-Headers", "Retry-After");
  }
  return response;
}
export async function handleAuth(request: Request): Promise<Response> {
  try {
    const path = new URL(request.url).pathname.slice("/api/auth".length);
    let methods: string[] = [];
    if (path === "/sign-in/social" || path === "/sign-out") methods = ["POST"];
    else if (path === "/feedbax/sign-in") methods = ["GET", "POST"];
    else if (path === "/error") methods = ["GET"];
    else if (path === "/sign-in/anonymous" && config.auth.anonymous) methods = ["POST"];
    else if (path === "/callback/github" || path === "/callback/google") {
      const provider = path === "/callback/github" ? "github" : "google";
      if (publicConfig().oauth[provider]) methods = ["GET", "POST"];
    }
    if (!methods.includes(request.method))
      return new Response(null, {
        status: methods.length ? 405 : 404,
        headers: {
          "Cache-Control": "no-store",
          ...(methods.length ? { Allow: methods.join(", ") } : {}),
        },
      });
    if (request.method === "POST" && !path.startsWith("/callback/"))
      requireSameOrigin(request, env.PORTAL_URL);
    const response = await createAuth().handler(request);
    response.headers.set("Cache-Control", "no-store");
    if (response.status >= 500) {
      const correlationId = crypto.randomUUID();
      reportUnexpected(undefined, "auth.request", correlationId);
      return Response.json(
        { error: { code: "unavailable", message: "Please try again shortly." } },
        { status: 503, headers: { "Cache-Control": "no-store", "X-Request-ID": correlationId } },
      );
    }
    const retryAfter = response.headers.get("X-Retry-After");
    if (response.status === 429 && retryAfter) response.headers.set("Retry-After", retryAfter);
    return response;
  } catch (error) {
    return errorResponse(error, "auth.request");
  }
}
export async function handleHealth(settings = config): Promise<Response> {
  try {
    const db = createDb(env.DB);
    const states = await db
      .select()
      .from(syncState)
      .where(
        inArray(syncState.key, [
          "notion.error",
          "notion.backoff",
          "github.error",
          "github.backoff",
        ]),
      );
    const failing = (provider: string) =>
      states.some(
        (state) =>
          state.key === `${provider}.error` ||
          (state.key === `${provider}.backoff` && Date.parse(JSON.parse(state.value)) > Date.now()),
      );
    return Response.json(
      {
        ok: true,
        notion: failing("notion") ? "failing" : "ok",
        github: settings.integrations.github ? (failing("github") ? "failing" : "ok") : "off",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    reportUnexpected(error, "health.read");
    return Response.json(
      { ok: false, notion: "failing", github: settings.integrations.github ? "failing" : "off" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
