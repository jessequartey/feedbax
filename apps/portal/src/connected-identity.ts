import { createHash, randomBytes } from "node:crypto";
import { verifyIdentityHandoff, type ConnectedStore } from "@feedbax/feedback";

const challengeCookie = "__Host-feedbax-handoff";
const sessionCookie = "__Host-feedbax-session";
export const sessionHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function readSessionToken(request: Request) {
  return cookie(request, sessionCookie);
}
export function sameOrigin(request: Request, siteUrl: string) {
  return request.headers.get("origin") === new URL(siteUrl).origin;
}
export function createConnectedIdentityHandler(options: {
  siteUrl: string;
  loginUrl: string;
  issuer: string;
  secret: string;
  store: ConnectedStore;
  now?: () => number;
}) {
  const origin = new URL(options.siteUrl).origin;
  return async (request: Request): Promise<Response> => {
    const path = new URL(request.url).pathname;
    const headers = new Headers({
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    });
    const json = (value: unknown, status = 200) =>
      Response.json(value, { status, headers });
    try {
      if (path === "/internal/identity/start" && request.method === "GET") {
        const state = randomBytes(32).toString("base64url");
        const target = new URL(options.loginUrl);
        target.searchParams.set("state", state);
        target.searchParams.set(
          "callback",
          `${origin}/internal/identity/callback`,
        );
        headers.set(
          "Set-Cookie",
          `${challengeCookie}=${state}; Path=/; Max-Age=300; HttpOnly; Secure; SameSite=None`,
        );
        headers.set("Location", target.toString());
        return new Response(null, { status: 303, headers });
      }
      if (path === "/internal/identity/callback" && request.method === "POST") {
        if (request.headers.get("origin") !== new URL(options.loginUrl).origin)
          return json({ error: "Sign-in origin is invalid." }, 403);
        const body = await request.text();
        if (body.length > 12000)
          return json({ error: "Sign-in request is too large." }, 413);
        const form = new URLSearchParams(body);
        const now = options.now?.() ?? Date.now();
        const identity = verifyIdentityHandoff(
          form.get("token") ?? "",
          options.secret,
          {
            audience: origin,
            issuer: options.issuer,
            state: cookie(request, challengeCookie) ?? "",
            now: Math.floor(now / 1000),
          },
        );
        const token = randomBytes(32).toString("base64url");
        await options.store.acceptIdentity({
          ...identity,
          subject: JSON.stringify([identity.issuer, identity.subject]),
          nonce: identity.nonce,
          challenge: identity.state,
          sessionHash: sessionHash(token),
          expiresAt: now + 7 * 86400000,
        });
        headers.append(
          "Set-Cookie",
          `${sessionCookie}=${token}; Path=/; Max-Age=604800; HttpOnly; Secure; SameSite=Lax`,
        );
        headers.append(
          "Set-Cookie",
          `${challengeCookie}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None`,
        );
        headers.set("Location", origin);
        return new Response(null, { status: 303, headers });
      }
      if (path === "/internal/identity/session" && request.method === "GET") {
        const token = readSessionToken(request);
        const participant = token
          ? await options.store.session(sessionHash(token), options.now?.())
          : undefined;
        return json({
          participant: participant
            ? { displayName: participant.displayName }
            : null,
        });
      }
      if (path === "/internal/identity/logout" && request.method === "POST") {
        if (!sameOrigin(request, origin))
          return json({ error: "Request origin is invalid." }, 403);
        const token = readSessionToken(request);
        if (token) await options.store.logout(sessionHash(token));
        headers.set(
          "Set-Cookie",
          `${sessionCookie}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
        );
        return json({ signedOut: true });
      }
      return json({ error: "Not found." }, 404);
    } catch {
      return json(
        { error: "Sign-in could not be completed. Start sign-in again." },
        401,
      );
    }
  };
}
function cookie(request: Request, name: string): string | undefined {
  const pairs = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((v) => v.trim())
    .filter((v) => v.startsWith(`${name}=`));
  return pairs.length === 1 ? pairs[0]!.slice(name.length + 1) : undefined;
}
