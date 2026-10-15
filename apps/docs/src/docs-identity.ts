import type { D1Database } from "@cloudflare/workers-types";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth/minimal";
import { magicLink } from "better-auth/plugins/magic-link";
import { drizzle } from "drizzle-orm/d1";
import { createIdentityLoginHandler } from "../examples/identity-handoff.server";
import * as schema from "./lib/auth-schema";
import { signInSchema } from "./sign-in-schema";

export function createDocsIdentityApplication(options: {
  database: D1Database;
  origin: string;
  portalOrigin: string;
  authSecret: string;
  handoffSecret: string;
  emailFrom: string;
  resendToken: string;
  request?: typeof fetch;
}) {
  const origin = new URL(options.origin).origin;
  if (new URL(origin).protocol !== "https:")
    throw new Error("Docs sign-in requires HTTPS.");
  if (
    options.authSecret.length < 32 ||
    !options.resendToken.trim() ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(options.emailFrom)
  )
    throw new Error("Docs sign-in secrets or sender are incomplete.");
  const auth = betterAuth({
    appName: "Feedbax Docs",
    baseURL: origin,
    secret: options.authSecret,
    trustedOrigins: [origin],
    database: drizzleAdapter(drizzle(options.database), {
      provider: "sqlite",
      schema,
    }),
    session: { expiresIn: 7 * 86400, updateAge: 86400 },
    advanced: {
      useSecureCookies: true,
      cookiePrefix: "feedbax-docs",
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    rateLimit: { enabled: true, storage: "database", window: 60, max: 30 },
    plugins: [
      magicLink({
        storeToken: "hashed",
        expiresIn: 300,
        sendMagicLink: async ({ email, url, token }) => {
          const confirmation = new URL("/sign-in", origin);
          confirmation.hash = new URLSearchParams({
            token,
            returnTo: localReturnTo(
              new URL(url).searchParams.get("callbackURL"),
              origin,
            ),
          }).toString();
          const response = await (options.request ?? fetch)(
            "https://api.resend.com/emails",
            {
              method: "POST",
              redirect: "error",
              signal: AbortSignal.timeout(10000),
              headers: {
                Authorization: `Bearer ${options.resendToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: options.emailFrom,
                to: [email],
                subject: "Sign in to Feedbax Docs",
                text: `Use this link to sign in to Feedbax Docs. It expires in five minutes and can be used once.\n\n${confirmation}\n\nIf you did not request this email, you can ignore it.`,
              }),
            },
          );
          await response.body?.cancel();
          if (!response.ok) throw new Error("Sign-in email could not be sent.");
        },
      }),
    ],
  });
  const handoff = createIdentityLoginHandler({
    applicationOrigin: origin,
    portalOrigin: options.portalOrigin,
    issuer: origin,
    secret: options.handoffSecret,
    authenticate: async (request) => {
      const session = await auth.api.getSession({ headers: request.headers });
      return session?.user.emailVerified
        ? {
            subject: session.user.id,
            displayName: session.user.name,
            email: session.user.email,
            emailVerified: true,
          }
        : null;
    },
  });
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    let response: Response;
    if (url.origin !== origin)
      response = new Response("Invalid origin.", { status: 400 });
    else if (
      request.method === "POST" &&
      request.headers.get("origin") !== origin
    )
      response = new Response("Invalid request origin.", { status: 403 });
    else if (url.pathname === "/api/docs/verify" && request.method === "POST") {
      const text = await boundedBody(request);
      if (text === undefined)
        response = new Response("Request too large.", { status: 413 });
      else {
        let body: unknown;
        try {
          body = JSON.parse(text);
        } catch {
          body = null;
        }
        if (
          !body ||
          typeof body !== "object" ||
          !("token" in body) ||
          typeof body.token !== "string" ||
          body.token.length > 256 ||
          !body.token
        )
          response = new Response("Invalid sign-in link.", { status: 400 });
        else {
          const verifyUrl = new URL("/api/auth/magic-link/verify", origin);
          verifyUrl.searchParams.set("token", body.token);
          verifyUrl.searchParams.set("callbackURL", "/docs");
          const result = await auth.handler(
            new Request(verifyUrl, { headers: request.headers }),
          );
          const location = result.headers.get("location");
          if (
            result.status !== 302 ||
            !location ||
            new URL(location, origin).searchParams.has("error")
          )
            response = new Response(
              "Sign-in link is invalid or expired. Request a new link.",
              { status: 401 },
            );
          else {
            const headers = new Headers();
            for (const cookie of result.headers.getSetCookie())
              headers.append("Set-Cookie", cookie);
            response = Response.json(
              {
                redirectTo: localReturnTo(
                  "returnTo" in body ? body.returnTo : null,
                  origin,
                ),
              },
              { headers },
            );
          }
        }
      }
    } else if (
      url.pathname === "/api/docs/session" &&
      request.method === "GET"
    ) {
      const session = await auth.api.getSession({ headers: request.headers });
      response = Response.json({
        user: session?.user.emailVerified ? { name: session.user.name } : null,
      });
    } else if (
      url.pathname === "/api/auth/sign-in/magic-link" &&
      request.method === "POST"
    ) {
      const body = await boundedBody(request);
      if (body === undefined)
        response = new Response("Request too large.", { status: 413 });
      else {
        let input: unknown;
        try {
          input = JSON.parse(body);
        } catch {
          input = null;
        }
        const parsed = signInSchema.safeParse(input);
        response = parsed.success
          ? await auth.handler(
              new Request(request, {
                body: JSON.stringify({
                  ...parsed.data,
                  callbackURL: localReturnTo(
                    input && typeof input === "object" && "callbackURL" in input
                      ? input.callbackURL
                      : null,
                    origin,
                  ),
                }),
              }),
            )
          : new Response("Enter your name and a valid email address.", {
              status: 400,
            });
      }
    } else if (
      url.pathname === "/api/auth/sign-out" &&
      request.method === "POST"
    ) {
      response = await auth.handler(new Request(request, { body: "{}" }));
    } else if (url.pathname === "/feedbax-login") {
      response = await handoff(request);
      if (response.status === 401) {
        response = new Response(null, {
          status: 303,
          headers: {
            Location: `/sign-in?${new URLSearchParams({ returnTo: url.pathname + url.search })}`,
          },
        });
      }
    } else response = new Response("Not found.", { status: 404 });
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    headers.set("Referrer-Policy", "no-referrer");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(response.body, { status: response.status, headers });
  };
}

function localReturnTo(value: unknown, origin: string) {
  if (typeof value !== "string" || value.length > 2048) return "/docs";
  try {
    const target = new URL(value, origin);
    return target.origin === origin &&
      (target.pathname === "/feedbax-login" || target.pathname === "/docs") &&
      !target.hash
      ? target.pathname + target.search
      : "/docs";
  } catch {
    return "/docs";
  }
}

async function boundedBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    length += next.value.byteLength;
    if (length > 4096) {
      await reader.cancel();
      return undefined;
    }
    chunks.push(next.value);
  }
  const buffer = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(buffer);
}
