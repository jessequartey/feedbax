import { env } from "cloudflare:workers";
// "minimal" leaves out Kysely and its SQLite dialects; Feedbax uses the Drizzle adapter.
import { betterAuth } from "better-auth/minimal";
import { createAuthEndpoint, APIError, getSessionFromCtx } from "better-auth/api";
import { getSessionCookie, setSessionCookie } from "better-auth/cookies";
import { anonymous } from "better-auth/plugins/anonymous";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { eq, sql } from "drizzle-orm";
import config from "../../feedbax.config.ts";
import type { FeedbaxConfig, PublicConfig } from "../contracts/config.ts";
import type { ViewerUser } from "../contracts/domain.ts";
import { createDb, schema } from "../db/client.ts";
import { decode64 } from "./encoding.ts";
import { consumeHostToken, resolveHostUser, verifyHostToken } from "./host-token.ts";
import { DomainError, reportUnexpected } from "./errors.ts";
import { requireSameOrigin } from "./request.ts";
import { text } from "./validation.ts";

export function publicConfig(settings = config, bindings: Cloudflare.Env = env): PublicConfig {
  for (const provider of ["GITHUB", "GOOGLE"] as const) {
    if (
      Boolean(bindings[`${provider}_CLIENT_ID`]) !==
        Boolean(bindings[`${provider}_CLIENT_SECRET`]) ||
      [bindings[`${provider}_CLIENT_ID`], bindings[`${provider}_CLIENT_SECRET`]].some(
        (value) => value !== undefined && (!value || /\s/.test(value)),
      )
    )
      throw new Error(
        `Invalid OAuth configuration: ${provider}_CLIENT_ID / ${provider}_CLIENT_SECRET must both be set`,
      );
  }
  if (bindings.FEEDBAX_HOST_SECRET) {
    try {
      if (decode64(bindings.FEEDBAX_HOST_SECRET).length < 32) throw new Error();
    } catch {
      throw new Error("Invalid FEEDBAX_HOST_SECRET configuration.");
    }
  }
  return {
    hostLogin: Boolean(settings.appUrl && bindings.FEEDBAX_HOST_SECRET),
    name: settings.name,
    appUrl: settings.appUrl,
    anonymous: settings.auth.anonymous,
    oauth: {
      github: Boolean(bindings.GITHUB_CLIENT_ID && bindings.GITHUB_CLIENT_SECRET),
      google: Boolean(bindings.GOOGLE_CLIENT_ID && bindings.GOOGLE_CLIENT_SECRET),
    },
  };
}
function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );
}
export function safeDestination(value: unknown): string {
  return typeof value === "string" &&
    (value === "/" ||
      (value.length === 43 &&
        /^\/posts\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          value,
        )))
    ? value
    : "/";
}
export async function transferAnonymousUser(
  from: string,
  to: string,
  bindings: Cloudflare.Env = env,
) {
  if (from === to) return;
  const db = createDb(bindings.DB);
  // Duplicate votes disappear during the merge, so revise all affected posts, including
  // posts the anonymous user only voted on. Keep ownership transfer and merge atomic.
  await db.batch([
    db
      .update(schema.posts)
      .set({ revision: sql`${schema.posts.revision} + 1`, updatedAt: Date.now() })
      .where(
        sql`${schema.posts.authorId} = ${from} OR ${schema.posts.id} IN (SELECT post_id FROM comments WHERE author_id = ${from} UNION SELECT post_id FROM votes WHERE user_id = ${from})`,
      ),
    db.update(schema.posts).set({ authorId: to }).where(eq(schema.posts.authorId, from)),
    db.update(schema.comments).set({ authorId: to }).where(eq(schema.comments.authorId, from)),
    db
      .insert(schema.votes)
      .select(
        db
          .select({
            postId: schema.votes.postId,
            userId: sql<string>`${to}`.as("user_id"),
            createdAt: schema.votes.createdAt,
          })
          .from(schema.votes)
          .where(eq(schema.votes.userId, from)),
      )
      .onConflictDoNothing(),
    db.delete(schema.votes).where(eq(schema.votes.userId, from)),
  ]);
}
export function createAuth(settings: FeedbaxConfig = config, bindings: Cloudflare.Env = env) {
  const exposed = publicConfig(settings, bindings);
  // Deferred to request time: Workers bindings must not be read during the build.
  let portal: URL;
  try {
    portal = new URL(bindings.PORTAL_URL);
  } catch {
    throw new Error("Invalid PORTAL_URL");
  }
  if (
    portal.username ||
    portal.password ||
    (portal.protocol !== "https:" &&
      !(
        portal.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(portal.hostname)
      ))
  )
    throw new Error("Invalid PORTAL_URL");
  if (!bindings.BETTER_AUTH_SECRET || bindings.BETTER_AUTH_SECRET.length < 32)
    throw new Error("Invalid BETTER_AUTH_SECRET");
  return betterAuth({
    appName: settings.name,
    baseURL: bindings.PORTAL_URL,
    secret: bindings.BETTER_AUTH_SECRET,
    database: drizzleAdapter(createDb(bindings.DB), {
      provider: "sqlite",
      schema,
      transaction: false,
    }),
    trustedOrigins: [bindings.PORTAL_URL],
    logger: { disabled: true },
    emailAndPassword: { enabled: false },
    // Defense in depth; the HTTP mount's exact allowlist is authoritative.
    disabledPaths: [
      "/sign-in/email",
      "/sign-up/email",
      "/request-password-reset",
      "/reset-password/:token",
      "/reset-password",
      "/verify-password",
      "/set-password",
      "/change-password",
      "/change-email",
      "/update-user",
      "/update-session",
      "/delete-user",
      "/delete-user/callback",
      "/link-social",
      "/unlink-account",
      "/list-accounts",
      "/get-access-token",
      "/refresh-token",
      "/account-info",
      "/send-verification-email",
      "/verify-email",
    ],
    account: { accountLinking: { enabled: false } },
    user: {
      additionalFields: {
        hostSubject: {
          type: "string",
          required: false,
          unique: true,
          input: false,
          returned: false,
        },
        isAnonymous: { type: "boolean", required: false, input: false, defaultValue: false },
      },
    },
    session: { expiresIn: 7 * 24 * 60 * 60, cookieCache: { enabled: false } },
    advanced: {
      disableOriginCheck: false,
      disableCSRFCheck: false,
      database: { generateId: "uuid" },
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: portal.protocol === "https:",
      },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      customRules: {
        "/sign-in/anonymous": { window: 60, max: 5 },
      },
    },
    socialProviders: {
      ...(exposed.oauth.github
        ? {
            github: {
              clientId: bindings.GITHUB_CLIENT_ID!,
              clientSecret: bindings.GITHUB_CLIENT_SECRET!,
            },
          }
        : {}),
      ...(exposed.oauth.google
        ? {
            google: {
              clientId: bindings.GOOGLE_CLIENT_ID!,
              clientSecret: bindings.GOOGLE_CLIENT_SECRET!,
            },
          }
        : {}),
    },
    databaseHooks: {
      user: {
        update: {
          before: async (user) => {
            try {
              if (user.name !== undefined) text(user.name, 80, "name");
              if (user.email?.toLowerCase().endsWith("@users.feedbax.invalid")) throw new Error();
            } catch {
              throw new APIError("BAD_REQUEST", { message: "Check the supplied name or email." });
            }
            return { data: user };
          },
        },
        create: {
          before: async (user) => {
            try {
              text(user.name, 80, "name");
              if (!user.hostSubject && user.email.toLowerCase().endsWith("@users.feedbax.invalid"))
                throw new Error();
            } catch {
              throw new APIError("BAD_REQUEST", {
                message: "A display name of 1–80 characters is required.",
              });
            }
            return { data: user };
          },
        },
      },
    },
    plugins: [
      ...(settings.auth.anonymous
        ? [
            anonymous({
              generateName: () => "Anonymous",
              disableDeleteAnonymousUser: true,
              onLinkAccount: async ({ anonymousUser, newUser, ctx }) => {
                if (anonymousUser.user.id === newUser.user.id || newUser.user.isAnonymous) return;
                try {
                  await transferAnonymousUser(anonymousUser.user.id, newUser.user.id, bindings);
                  await ctx.context.internalAdapter.deleteUser(anonymousUser.user.id);
                } catch (error) {
                  reportUnexpected(error, "anonymous-transfer");
                }
              },
            }),
          ]
        : []),
      {
        id: "feedbax",
        endpoints: {
          feedbaxSignIn: createAuthEndpoint(
            "/feedbax/sign-in",
            {
              method: ["GET", "POST"],
              metadata: {
                allowedMediaTypes: ["application/json", "application/x-www-form-urlencoded"],
              },
            },
            async (ctx) => {
              ctx.setHeader("Cache-Control", "no-store");
              ctx.setHeader("Referrer-Policy", "no-referrer");
              const query = new URL(ctx.request!.url).searchParams;
              let claims;
              try {
                claims = await verifyHostToken(
                  query.get("token") ?? "",
                  bindings.FEEDBAX_HOST_SECRET,
                );
              } catch (error) {
                if (!(error instanceof DomainError)) throw error;
                if (error.code === "unavailable")
                  return new Response("Invalid FEEDBAX_HOST_SECRET configuration.", {
                    status: 503,
                    headers: { "Cache-Control": "no-store" },
                  });
                // Only the configured app URL is reflected; the query is never echoed.
                const app = settings.appUrl
                  ? `<a href="${escapeHtml(settings.appUrl)}">${escapeHtml(new URL(settings.appUrl).host)}</a>`
                  : "your app";
                return new Response(
                  `<!doctype html><html><head><meta name="referrer" content="no-referrer"><title>Link expired</title></head><body><p>This link expired — go back to ${app} and try again.</p></body></html>`,
                  {
                    status: 401,
                    headers: {
                      "Content-Type": "text/html; charset=utf-8",
                      "Cache-Control": "no-store",
                      "Referrer-Policy": "no-referrer",
                      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
                    },
                  },
                );
              }
              if (ctx.request!.method === "GET") {
                // no-referrer makes native form navigations send Origin: null in Chrome.
                // Send only the origin, keeping the token's path/query out of Referer.
                ctx.setHeader("Referrer-Policy", "strict-origin");
                const action = `/api/auth/feedbax/sign-in?${new URLSearchParams({ token: query.get("token")!, to: safeDestination(query.get("to")) })}`;
                return new Response(
                  `<!doctype html><html><head><meta name="referrer" content="strict-origin"><title>Confirm sign in</title></head><body><h1>Sign in to ${escapeHtml(settings.name)}</h1><p>Continue as <strong>${escapeHtml(claims.name)}</strong> (${escapeHtml(claims.sub)})?</p><p>If this browser has anonymous feedback, it will move to this account.</p><form method="post" action="${escapeHtml(action)}"><button type="submit">Continue as ${escapeHtml(claims.name)}</button></form></body></html>`,
                  {
                    headers: {
                      "Content-Type": "text/html; charset=utf-8",
                      "Cache-Control": "no-store",
                      "Referrer-Policy": "strict-origin",
                      "Content-Security-Policy":
                        "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
                      "X-Content-Type-Options": "nosniff",
                    },
                  },
                );
              }
              try {
                requireSameOrigin(ctx.request!, bindings.PORTAL_URL);
              } catch {
                throw new APIError("FORBIDDEN", { message: "This origin is not allowed." });
              }
              const previous = settings.auth.anonymous
                ? await getSessionFromCtx(ctx, { disableRefresh: true })
                : null;
              const user = await resolveHostUser(claims, ctx.context.internalAdapter, bindings.DB);
              const session = await ctx.context.internalAdapter.createSession(user.id);
              if (!session)
                throw new APIError("SERVICE_UNAVAILABLE", { message: "Please try again shortly." });
              // Consume only after fallible identity/session creation, before exposing the cookie.
              try {
                await consumeHostToken(claims, bindings.DB);
              } catch (error) {
                await ctx.context.internalAdapter
                  .deleteSession(session.token)
                  .catch(() => undefined);
                if (error instanceof DomainError)
                  throw new APIError("UNAUTHORIZED", {
                    message: "This link expired — go back to your app and try again.",
                  });
                throw error;
              }
              await setSessionCookie(ctx, { session, user });
              // The anonymous plugin's built-in matcher only sees /sign-in/* and
              // /sign-up/*, so the custom host endpoint uses the same transfer here.
              if (previous?.user.isAnonymous && previous.user.id !== user.id) {
                try {
                  await transferAnonymousUser(previous.user.id, user.id, bindings);
                  await ctx.context.internalAdapter.deleteUser(previous.user.id);
                } catch (error) {
                  // Concurrent writes can keep this anonymous row alive. Cleanup must never
                  // burn the link and prevent sign-in; retain its data for a later transfer.
                  reportUnexpected(error, "anonymous-transfer");
                }
              }
              throw ctx.redirect(safeDestination(query.get("to")));
            },
          ),
        },
      },
    ],
  });
}
export async function viewerUser(
  headers: Headers,
  settings = config,
  bindings: Cloudflare.Env = env,
): Promise<ViewerUser | null> {
  if (!getSessionCookie(headers)) return null;
  const session = await createAuth(settings, bindings).api.getSession({ headers });
  if (!session) return null;
  // hostSubject is deliberately absent from Better Auth's public user output.
  const row = await createDb(bindings.DB)
    .select({ hostSubject: schema.user.hostSubject, isAnonymous: schema.user.isAnonymous })
    .from(schema.user)
    .where(eq(schema.user.id, session.user.id))
    .get();
  if (!row) return null;
  return {
    id: session.user.id,
    name: row.isAnonymous ? "Anonymous" : session.user.name,
    kind: row.isAnonymous ? "anonymous" : row.hostSubject !== null ? "host" : "account",
  };
}
export function requireWriter(user: ViewerUser | null, settings = config): ViewerUser {
  if (!user) throw new DomainError("unauthenticated", "Sign in to continue.");
  if (user.kind === "anonymous" && !settings.auth.anonymous)
    throw new DomainError("forbidden", "Anonymous feedback is disabled.");
  return user;
}
