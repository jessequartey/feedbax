import { randomUUID } from "node:crypto";
import type { D1Database } from "@cloudflare/workers-types";
import type { FeedbackModule, PostStatus } from "./index";

export type ObservedHistoryEvent = {
  id: string;
  observedAt: Date;
} & ({ kind: "status"; status: PostStatus } | { kind: "update"; body: string });
export interface ObservedHistoryPage {
  available: boolean;
  items: ObservedHistoryEvent[];
  nextCursor?: string;
}
type Snapshot = { status: PostStatus; response: string | null };
type Observation = { revision: number; projection: string | null };
type EventRow = {
  id: string;
  revision: number;
  kind: "status" | "update";
  status: PostStatus | null;
  message: string | null;
  observed_at: number;
};

// Callers supply the configured Feedback module, never provider payloads. The
// initial visible snapshot is a baseline, not reconstructed historical activity.
export function createObservedHistoryModule(options: {
  database: D1Database;
  feedback: FeedbackModule;
  now?: () => number;
}) {
  const { database, feedback } = options;
  const now = options.now ?? Date.now;
  const observe = async (slug: string) => {
    const time = now();
    const known = await database
      .prepare("SELECT 1 FROM public_post_observations WHERE post_slug=?")
      .bind(slug)
      .first();
    if (!known) {
      const post = await feedback.getPublicPost(slug);
      if (!post) return;
      await database
        .prepare(
          "INSERT OR IGNORE INTO public_post_observations(post_slug,projection,checked_at) VALUES(?,?,?)",
        )
        .bind(
          slug,
          JSON.stringify({
            status: post.status,
            response: post.teamResponse ?? null,
          }),
          time,
        )
        .run();
      return post;
    }
    const token = randomUUID();
    const previous = await database
      .prepare(
        "UPDATE public_post_observations SET lease_token=?,lease_until=?,checked_at=? WHERE post_slug=? AND lease_until<=? RETURNING revision,projection",
      )
      .bind(token, time + 60000, time, slug, time)
      .first<Observation>();
    if (!previous) return feedback.getPublicPost(slug);
    let providerReadSucceeded = false;
    try {
      const post = await feedback.getPublicPost(slug);
      providerReadSucceeded = true;
      const snapshot: Snapshot | null = post
        ? { status: post.status, response: post.teamResponse ?? null }
        : null;
      const encoded = snapshot ? JSON.stringify(snapshot) : null;
      const before: Snapshot | null = previous.projection
        ? JSON.parse(previous.projection)
        : null;
      const revision = previous.revision + 1;
      const statements = [];
      if (before && snapshot) {
        if (before.status !== snapshot.status)
          statements.push(
            database
              .prepare(
                "INSERT OR IGNORE INTO public_post_history(id,post_slug,revision,kind,status,observed_at) SELECT ?,?,?,'status',?,? WHERE EXISTS(SELECT 1 FROM public_post_observations WHERE post_slug=? AND lease_token=?)",
              )
              .bind(
                randomUUID(),
                slug,
                revision,
                snapshot.status,
                time,
                slug,
                token,
              ),
          );
        if (snapshot.response && before.response !== snapshot.response)
          statements.push(
            database
              .prepare(
                "INSERT OR IGNORE INTO public_post_history(id,post_slug,revision,kind,message,observed_at) SELECT ?,?,?,'update',?,? WHERE EXISTS(SELECT 1 FROM public_post_observations WHERE post_slug=? AND lease_token=?)",
              )
              .bind(
                randomUUID(),
                slug,
                revision,
                snapshot.response,
                time,
                slug,
                token,
              ),
          );
      }
      statements.push(
        database
          .prepare(
            "UPDATE public_post_observations SET revision=?,projection=?,lease_token=NULL,lease_until=0 WHERE post_slug=? AND lease_token=?",
          )
          .bind(revision, encoded, slug, token),
      );
      const committed = await database.batch(statements);
      // A later observer may have revoked visibility after this lease expired.
      // Its checkpoint wins; a fenced completion cannot authorize a public read.
      return committed.at(-1)?.meta.changes === 1 ? post : undefined;
    } catch (error) {
      // Provider access loss breaks the public baseline. A storage failure
      // preserves it so retry can durably record the same observed transition.
      await database
        .prepare(
          "UPDATE public_post_observations SET projection=CASE WHEN ? THEN projection ELSE NULL END,lease_token=NULL,lease_until=0 WHERE post_slug=? AND lease_token=?",
        )
        .bind(providerReadSucceeded ? 1 : 0, slug, token)
        .run();
      throw error;
    }
  };
  return {
    observe,
    async list(input: {
      slug: string;
      cursor?: string;
    }): Promise<ObservedHistoryPage> {
      if (!(await observe(input.slug))) return { available: false, items: [] };
      let revision = -1;
      let kind = "";
      if (input.cursor) {
        try {
          const parsed = JSON.parse(
            Buffer.from(input.cursor, "base64url").toString("utf8"),
          );
          if (
            parsed.slug !== input.slug ||
            !Number.isSafeInteger(parsed.revision) ||
            parsed.revision < 0 ||
            !["status", "update"].includes(parsed.kind)
          )
            throw Error();
          revision = parsed.revision;
          kind = parsed.kind;
        } catch {
          throw Error("Invalid observed-history cursor.");
        }
      }
      const rows = (
        await database
          .prepare(
            "SELECT id,revision,kind,status,message,observed_at FROM public_post_history WHERE post_slug=? AND (revision>? OR (revision=? AND kind>?)) ORDER BY revision,kind LIMIT 26",
          )
          .bind(input.slug, revision, revision, kind)
          .all<EventRow>()
      ).results;
      const selected = rows.slice(0, 25);
      const last = selected.at(-1);
      return {
        available: true,
        items: selected.map((row) => ({
          id: row.id,
          observedAt: new Date(row.observed_at),
          ...(row.kind === "status"
            ? { kind: "status" as const, status: row.status! }
            : { kind: "update" as const, body: row.message! }),
        })),
        ...(rows.length > 25 && last
          ? {
              nextCursor: Buffer.from(
                JSON.stringify({
                  slug: input.slug,
                  revision: last.revision,
                  kind: last.kind,
                }),
              ).toString("base64url"),
            }
          : {}),
      };
    },
    async synchronize(limit = 1) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 10)
        throw Error("History work limit must be 1–10.");
      const rows = (
        await database
          .prepare(
            "SELECT post_slug FROM public_post_observations WHERE lease_until<=? ORDER BY checked_at,post_slug LIMIT ?",
          )
          .bind(now(), limit)
          .all<{ post_slug: string }>()
      ).results;
      let checked = 0,
        failed = 0;
      for (const row of rows) {
        try {
          await observe(row.post_slug);
          checked++;
        } catch {
          failed++;
        }
      }
      return { checked, failed };
    },
  };
}
