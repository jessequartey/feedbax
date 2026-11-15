import { env } from "cloudflare:workers";
import { and, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import type { AdminUser, UserFilter } from "../contracts/admin.ts";
import type { Page, ViewerUser } from "../contracts/domain.ts";
import { createDb } from "../db/client.ts";
import { user } from "../db/schema.ts";
import { SYNTHETIC_ADMIN_ID, grantAdmin } from "./admin.ts";
import { DomainError, invalid } from "./errors.ts";
import { pageNumber, record, text, uuid } from "./validation.ts";

// User management rules. `admin` is the signed-in admin making the change (already checked
// by requireAdmin in admin-api.ts). Rules live here so they hold for every caller.

const PAGE_SIZE = 25;
const NO_EMAIL = "@users.feedbax.invalid";

export async function listUsers(input: unknown, admin: ViewerUser): Promise<Page<AdminUser>> {
  const data = record(input),
    page = pageNumber(data.page),
    q = data.q === undefined ? "" : text(data.q, 100, "q", 0).trim(),
    filter = data.filter ?? "all";
  if (filter !== "all" && filter !== "admin" && filter !== "banned") invalid("filter");
  const pattern = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
  const where = and(
    q
      ? or(
          sql`${user.name} LIKE ${pattern} ESCAPE ${"\\"}`,
          sql`${user.email} LIKE ${pattern} ESCAPE ${"\\"}`,
        )
      : undefined,
    (filter as UserFilter) === "admin" ? eq(user.role, "admin") : undefined,
    (filter as UserFilter) === "banned" ? isNotNull(user.bannedAt) : undefined,
  );
  const db = createDb(env.DB);
  const [rows, total] = await Promise.all([
    db
      .select()
      .from(user)
      .where(where)
      .orderBy(desc(user.createdAt), desc(user.id))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ count: sql<number>`count(*)` })
      .from(user)
      .where(where)
      .get(),
  ]);
  return {
    items: rows.map((row): AdminUser => {
      const builtIn = row.id === SYNTHETIC_ADMIN_ID;
      return {
        id: row.id,
        name: row.isAnonymous ? "Anonymous" : row.name,
        email: row.email.toLowerCase().endsWith(NO_EMAIL) ? null : row.email,
        kind: row.isAnonymous ? "anonymous" : row.hostSubject !== null ? "host" : "account",
        admin: row.role === "admin",
        banned: row.bannedAt !== null,
        builtIn,
        self: row.id === admin.id,
        createdAt: row.createdAt.toISOString(),
      };
    }),
    page,
    limit: PAGE_SIZE,
    total: total!.count,
    hasMore: page * PAGE_SIZE < total!.count,
  };
}

async function findUser(id: string) {
  const row = await createDb(env.DB).select().from(user).where(eq(user.id, id)).get();
  if (!row) throw new DomainError("not_found", "User not found.");
  return row;
}

/**
 * Ban or unban. A banned user keeps their session and can read, but cannot post, vote or
 * comment (requireWriter). Admins, the built-in admin and yourself cannot be banned: revoke
 * admin first, so nobody locks the last admin out.
 */
export async function setBanned(input: unknown, admin: ViewerUser, now = Date.now()) {
  const data = record(input),
    userId = uuid(data.userId, "userId");
  if (typeof data.banned !== "boolean") invalid("banned");
  const target = await findUser(userId);
  if (data.banned) {
    if (target.id === SYNTHETIC_ADMIN_ID)
      throw new DomainError("forbidden", "The built-in admin cannot be banned.");
    if (target.id === admin.id) throw new DomainError("forbidden", "You cannot ban yourself.");
    if (target.role === "admin")
      throw new DomainError("forbidden", "Revoke admin before banning this user.");
  }
  await createDb(env.DB)
    .update(user)
    .set({ bannedAt: data.banned ? (target.bannedAt ?? now) : null })
    .where(eq(user.id, userId));
  return { banned: data.banned };
}

/** Grant or revoke admin. You cannot revoke yourself; anonymous users cannot be admins. */
export async function setAdminRole(input: unknown, admin: ViewerUser) {
  const data = record(input),
    userId = uuid(data.userId, "userId");
  if (typeof data.admin !== "boolean") invalid("admin");
  const target = await findUser(userId);
  if (data.admin) {
    if (target.isAnonymous)
      throw new DomainError("forbidden", "Anonymous visitors cannot be admins.");
    await grantAdmin(userId);
  } else {
    if (target.id === admin.id)
      throw new DomainError("forbidden", "You cannot revoke your own admin access.");
    await createDb(env.DB).update(user).set({ role: "user" }).where(eq(user.id, userId));
  }
  return { admin: data.admin };
}
