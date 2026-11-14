import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import config from "../../feedbax.config.ts";
import { LIMITS } from "../contracts/domain.ts";
import type { ErrorCode } from "../contracts/domain.ts";
import { createDb } from "../db/client.ts";
import { syncState } from "../db/schema.ts";
import { createAuth } from "./auth.ts";
import { consumeHostToken, resolveHostUser, verifyHostToken } from "./host-token.ts";
import { createPostForUser } from "./posts.ts";
import { apiError, DomainError } from "./errors.ts";

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
export function errorResponse(error: unknown) {
  const body = apiError(error);
  return Response.json(
    { error: body },
    {
      status: STATUS[body.code],
      headers: {
        "Cache-Control": "no-store",
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
      new URL(env.PORTAL_URL).hostname === "localhost" &&
      parsed.hostname === "localhost" &&
      parsed.protocol === "http:"
    );
  } catch {
    return false;
  }
}
async function multipart(request: Request) {
  // Bound the body even when Content-Length is omitted or forged.
  const max = LIMITS.images * LIMITS.imageBytes + 65536;
  const length = Number(request.headers.get("content-length"));
  if (length > max) throw new DomainError("too_large", "The submission is too large.");
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;"))
    throw new DomainError("invalid_input", "Use multipart form data.");
  const reader = request.body?.getReader();
  if (!reader) throw new DomainError("invalid_input", "A submission is required.");
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new DomainError("too_large", "The submission is too large.");
      }
      chunks.push(value);
    }
    return await new Response(new Blob(chunks), {
      headers: { "Content-Type": request.headers.get("content-type")! },
    }).formData();
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("invalid_input", "Invalid multipart form data.");
  } finally {
    reader.releaseLock();
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
    response = errorResponse(error);
  }
  response.headers.set("Vary", "Origin");
  if (cors) {
    response.headers.set("Access-Control-Allow-Origin", origin!);
    response.headers.set("Access-Control-Allow-Methods", "POST");
    response.headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  }
  return response;
}
export async function handleAuth(request: Request): Promise<Response> {
  try {
    const response = await createAuth().handler(request);
    response.headers.set("Cache-Control", "no-store");
    const retryAfter = response.headers.get("X-Retry-After");
    if (response.status === 429 && retryAfter) response.headers.set("Retry-After", retryAfter);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
export async function handleHealth(settings = config): Promise<Response> {
  try {
    const db = createDb(env.DB);
    const [notion, github] = await Promise.all([
      db
        .select({ key: syncState.key })
        .from(syncState)
        .where(eq(syncState.key, "notion.error"))
        .get(),
      db
        .select({ key: syncState.key })
        .from(syncState)
        .where(eq(syncState.key, "github.error"))
        .get(),
    ]);
    return Response.json(
      {
        ok: true,
        notion: notion ? "failing" : "ok",
        github: settings.integrations.github ? (github ? "failing" : "ok") : "off",
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { ok: false, notion: "failing", github: settings.integrations.github ? "failing" : "off" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
