import { env } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { createAuthEndpoint, APIError, getSessionFromCtx } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { anonymous } from "better-auth/plugins/anonymous";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { eq, sql } from "drizzle-orm";
import config from "../../feedbax.config.ts";
import type { FeedbaxConfig, PublicConfig } from "../contracts/config.ts";
import type { ViewerUser } from "../contracts/domain.ts";
import { createDb, schema } from "../db/client.ts";
import { hashPassword, verifyPassword } from "./password.ts";
import { consumeHostToken, resolveHostUser, verifyHostToken } from "./host-token.ts";
import { DomainError } from "./errors.ts";
import { text } from "./validation.ts";

export function publicConfig(settings = config, bindings: Cloudflare.Env = env): PublicConfig {
  for (const provider of ["GITHUB", "GOOGLE"] as const) {
    if (
      Boolean(bindings[`${provider}_CLIENT_ID`]) !== Boolean(bindings[`${provider}_CLIENT_SECRET`])
    )
      throw new Error(
        `Invalid OAuth configuration: ${provider}_CLIENT_ID / ${provider}_CLIENT_SECRET must both be set`,
      );
  }
  return {
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
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: false,
      password: { hash: (password) => hashPassword(password), verify: verifyPassword },
    },
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
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 10 },
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
        create: {
          before: async (user) => {
            try {
              text(user.name, 80, "name");
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
              onLinkAccount: async ({ anonymousUser, newUser }) =>
                transferAnonymousUser(anonymousUser.user.id, newUser.user.id, bindings),
            }),
          ]
        : []),
      {
        id: "feedbax",
        endpoints: {
          feedbaxSignIn: createAuthEndpoint("/feedbax/sign-in", { method: "GET" }, async (ctx) => {
            ctx.setHeader("Cache-Control", "no-store");
            ctx.setHeader("Referrer-Policy", "no-referrer");
            const query = new URL(ctx.request!.url).searchParams;
            let claims;
            try {
              claims = await verifyHostToken(
                query.get("token") ?? "",
                bindings.FEEDBAX_HOST_SECRET,
              );
              await consumeHostToken(claims);
            } catch (error) {
              if (!(error instanceof DomainError)) throw error;
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
            const user = await resolveHostUser(claims, ctx.context.internalAdapter);
            const session = await ctx.context.internalAdapter.createSession(user.id);
            if (!session)
              throw new APIError("SERVICE_UNAVAILABLE", { message: "Please try again shortly." });
            // The anonymous plugin's built-in matcher only sees /sign-in/* and
            // /sign-up/*, so the custom host endpoint uses the same transfer here.
            const previous = settings.auth.anonymous
              ? await getSessionFromCtx(ctx, { disableRefresh: true })
              : null;
            if (previous?.user.isAnonymous && previous.user.id !== user.id) {
              await transferAnonymousUser(previous.user.id, user.id, bindings);
              await ctx.context.internalAdapter.deleteUser(previous.user.id);
            }
            await setSessionCookie(ctx, { session, user });
            throw ctx.redirect(safeDestination(query.get("to")));
          }),
        },
      },
    ],
  });
}
export async function viewerUser(headers: Headers, settings = config): Promise<ViewerUser | null> {
  const session = await createAuth(settings).api.getSession({ headers });
  if (!session) return null;
  // hostSubject is deliberately absent from Better Auth's public user output.
  const row = await createDb(env.DB)
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
