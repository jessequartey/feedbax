import { env } from "cloudflare:workers";
import { eq, lt } from "drizzle-orm";
import type { AdminLinkClaims } from "./admin-link.ts";
import { ADMIN_LINK_MAX_SKEW_SECONDS } from "./admin-link.ts";
import { createDb } from "../db/client.ts";
import { adminLinkNonces, user } from "../db/schema.ts";
import { DomainError } from "./errors.ts";

/** Where /admin/enter lands after a successful sign-in (ticket 05 builds the page). */
export const ADMIN_HOME = "/admin/moderation";
/**
 * The shared synthetic admin. A visitor who opens an admin link without a real signed-in
 * account gets a session for this user. The `.invalid` email can never match an OAuth
 * account, and it has no host subject, so no other sign-in path can reach it.
 */
export const SYNTHETIC_ADMIN_ID = "feedbac0-ad31-4000-8000-000000000001";
export const SYNTHETIC_ADMIN_EMAIL = "admin@users.feedbax.invalid";
export const SYNTHETIC_ADMIN_NAME = "Admin";

/**
 * Mark an admin link's nonce as used. Exactly one caller wins, including simultaneous
 * arrivals; every later call throws. Expired markers are pruned in the same batch:
 * links are rare, so this keeps the cron untouched.
 */
export async function consumeAdminNonce(
  claims: AdminLinkClaims,
  d1: D1Database = env.DB,
  now = Date.now(),
): Promise<void> {
  const db = createDb(d1);
  const [, inserted] = await db.batch([
    db.delete(adminLinkNonces).where(lt(adminLinkNonces.expiresAt, now)),
    db
      .insert(adminLinkNonces)
      .values({
        nonce: claims.nonce,
        // Keep the marker for as long as any accepted clock could still call the link valid.
        expiresAt: (claims.exp + ADMIN_LINK_MAX_SKEW_SECONDS) * 1000,
        usedAt: now,
      })
      .onConflictDoNothing()
      .returning({ nonce: adminLinkNonces.nonce }),
  ]);
  if (!inserted.length)
    throw new DomainError("unauthenticated", "This admin link was already used.");
}
export async function adminLinkUsed(nonce: string, d1: D1Database = env.DB): Promise<boolean> {
  const row = await createDb(d1)
    .select({ nonce: adminLinkNonces.nonce })
    .from(adminLinkNonces)
    .where(eq(adminLinkNonces.nonce, nonce))
    .get();
  return Boolean(row);
}
/** Create (or restore) the synthetic admin user and return its row. */
export async function ensureSyntheticAdmin(d1: D1Database = env.DB) {
  const db = createDb(d1);
  // Inserted directly: Better Auth's create hook rightly rejects `.invalid` emails.
  await db
    .insert(user)
    .values({
      id: SYNTHETIC_ADMIN_ID,
      name: SYNTHETIC_ADMIN_NAME,
      email: SYNTHETIC_ADMIN_EMAIL,
      emailVerified: false,
      isAnonymous: false,
      role: "admin",
    })
    .onConflictDoNothing();
  return (await db.select().from(user).where(eq(user.id, SYNTHETIC_ADMIN_ID)).get())!;
}
/** Grant the admin role. A link signed with the deployment secret also lifts any ban. */
export async function grantAdmin(userId: string, d1: D1Database = env.DB): Promise<void> {
  await createDb(d1).update(user).set({ role: "admin", bannedAt: null }).where(eq(user.id, userId));
}
export async function isBanned(userId: string, d1: D1Database = env.DB): Promise<boolean> {
  const row = await createDb(d1)
    .select({ bannedAt: user.bannedAt })
    .from(user)
    .where(eq(user.id, userId))
    .get();
  return row?.bannedAt != null;
}
