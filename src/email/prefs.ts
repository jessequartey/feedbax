import { env } from "cloudflare:workers";
import { and, eq, isNull, ne, or, sql } from "drizzle-orm";
import type { ViewerUser } from "../contracts/domain.ts";
import type { EmailPrefs, EmailSettings } from "../contracts/portal.ts";
import { createDb } from "../db/client.ts";
import { emailPrefs, user } from "../db/schema.ts";
import { DomainError, invalid } from "../server/errors.ts";
import { record } from "../server/validation.ts";
import { emailEnabled } from "./events.ts";
import { verifyUnsubscribe, type EmailKind, type UnsubscribeClaims } from "./unsubscribe.ts";

/** The email_prefs column behind each kind. */
export const PREF_COLUMNS = {
  status: emailPrefs.statusChanges,
  replies: emailPrefs.replies,
  changelog: emailPrefs.changelog,
  digest: emailPrefs.digest,
} as const satisfies Record<EmailKind, unknown>;
const FIELDS = {
  status: "statusChanges",
  replies: "replies",
  changelog: "changelog",
  digest: "digest",
} as const satisfies Record<EmailKind, keyof typeof emailPrefs.$inferInsert>;
export const DEFAULT_PREFS: EmailPrefs = {
  status: true,
  replies: true,
  changelog: false,
  digest: true,
};

/**
 * Someone email can reach: an account with a verified address from an OAuth provider.
 * Anonymous visitors, host-app users and the built-in admin only have `.invalid` addresses;
 * banned users get nothing.
 */
export const reachable = and(
  sql`coalesce(${user.isAnonymous}, 0) = 0`,
  isNull(user.bannedAt),
  eq(user.emailVerified, true),
  sql`lower(${user.email}) NOT LIKE '%@users.feedbax.invalid'`,
);

/** The preference as SQL: the stored choice, or the default when the row is missing. */
export function wants(kind: EmailKind) {
  return sql`coalesce(${PREF_COLUMNS[kind]}, ${DEFAULT_PREFS[kind] ? 1 : 0}) = 1`;
}

export async function getEmailSettings(viewer: ViewerUser | null): Promise<EmailSettings> {
  if (!viewer) throw new DomainError("unauthenticated", "Sign in to continue.");
  const row = await createDb(env.DB)
    .select({
      email: sql<string | null>`CASE WHEN ${reachable} THEN ${user.email} END`,
      status: PREF_COLUMNS.status,
      replies: PREF_COLUMNS.replies,
      changelog: PREF_COLUMNS.changelog,
      digest: PREF_COLUMNS.digest,
    })
    .from(user)
    .leftJoin(emailPrefs, eq(emailPrefs.userId, user.id))
    .where(eq(user.id, viewer.id))
    .get();
  const pick = (kind: EmailKind) => {
    const value = row?.[kind];
    return value === null || value === undefined ? DEFAULT_PREFS[kind] : value === 1;
  };
  return {
    enabled: emailEnabled(),
    address: row?.email ?? null,
    admin: Boolean(viewer.admin),
    prefs: {
      status: pick("status"),
      replies: pick("replies"),
      changelog: pick("changelog"),
      digest: pick("digest"),
    },
  };
}

/** Store the given switches; missing ones keep their value. Anonymous visitors cannot. */
export async function saveEmailPrefs(
  input: unknown,
  viewer: ViewerUser | null,
  now = Date.now(),
): Promise<EmailSettings> {
  if (!viewer) throw new DomainError("unauthenticated", "Sign in to continue.");
  if (viewer.kind === "anonymous")
    throw new DomainError("forbidden", "Anonymous visitors get no email.");
  const data = record(input);
  const set: Partial<Record<(typeof FIELDS)[EmailKind], number>> = {};
  for (const [key, value] of Object.entries(data)) {
    if (!(key in FIELDS) || typeof value !== "boolean") invalid(key);
    set[FIELDS[key as EmailKind]] = value ? 1 : 0;
  }
  if (Object.keys(set).length) {
    await createDb(env.DB)
      .insert(emailPrefs)
      .values({ userId: viewer.id, unsubscribeToken: crypto.randomUUID(), updatedAt: now, ...set })
      .onConflictDoUpdate({
        target: emailPrefs.userId,
        set: { ...set, updatedAt: now },
        // Retried desired values must not flip a switch or rewrite its timestamp/token.
        setWhere: or(
          ...Object.entries(set).map(([key, value]) =>
            ne(emailPrefs[key as (typeof FIELDS)[EmailKind]], value),
          ),
        ),
      });
  }
  return getEmailSettings(viewer);
}

/**
 * Apply a verified unsubscribe link: turn that kind off for that user. Idempotent, and a
 * no-op for a user that no longer exists.
 */
export async function applyUnsubscribe(claims: UnsubscribeClaims, now = Date.now()) {
  const column = sql.raw(`\`${PREF_COLUMNS[claims.kind].name}\``);
  await createDb(env.DB).run(
    sql`INSERT INTO email_prefs (user_id, ${column}, unsubscribe_token, updated_at)
      SELECT id, 0, ${crypto.randomUUID()}, ${now} FROM user WHERE id = ${claims.userId}
      ON CONFLICT(user_id) DO UPDATE SET ${column} = 0, updated_at = excluded.updated_at`,
  );
}

/** Verify a signed link's `u`, `k`, `t` and apply it. Throws invalid_input for a bad link. */
export async function unsubscribeWithLink(input: unknown): Promise<{ kind: EmailKind }> {
  const claims = await verifyUnsubscribe(record(input), env.BETTER_AUTH_SECRET);
  if (!claims) throw new DomainError("invalid_input", "This unsubscribe link is not valid.");
  await applyUnsubscribe(claims);
  return { kind: claims.kind };
}
