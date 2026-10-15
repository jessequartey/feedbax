import {
  createHash,
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import type { D1Database } from "@cloudflare/workers-types";
import { SQLiteAsyncDialect } from "drizzle-orm/sqlite-core";
import { sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { FeedbackModule } from "./index";
import type { EmailSender } from "./email-delivery";
import type { VerifiedParticipant } from "./connected";

export function createParticipationModule(options: {
  database: D1Database;
  feedback: FeedbackModule;
  participant?: VerifiedParticipant;
  now?: () => number;
  email?: {
    sender: EmailSender;
    from: string;
    siteUrl: string;
    unsubscribeSecret: string;
  };
}) {
  const db = drizzle(options.database);
  const now = () => options.now?.() ?? Date.now();
  const identity = () => {
    if (!options.participant) throw new Error("Sign in to participate.");
    return options.participant;
  };
  const published = async (slug: string) => {
    const post = await options.feedback.getPublicPost(slug);
    if (!post) throw new Error("Post is unavailable.");
    return post;
  };
  const visible = async (slug: string) => options.feedback.getPublicPost(slug);
  type ObservedEvent = {
    id: string;
    slug: string;
    kind: string;
    title: string;
    message: string;
    createdAt: number;
    actor?: string;
  };
  const record = async (
    events: ObservedEvent[],
    slug: string,
    leaseToken: string,
    checkpoint: SQL,
  ) => {
    if (!events.length) {
      await db.run(checkpoint);
      return;
    }
    const payload = JSON.stringify(events);
    // JSON keeps a complete Comment page below D1's 100-bound-parameter limit.
    const statements: SQL[] = [
      sql`INSERT INTO post_events(id,post_slug,kind,title,message,created_at,actor_subject) SELECT json_extract(value,'$.id'),json_extract(value,'$.slug'),json_extract(value,'$.kind'),json_extract(value,'$.title'),json_extract(value,'$.message'),json_extract(value,'$.createdAt'),json_extract(value,'$.actor') FROM json_each(${payload}) WHERE EXISTS(SELECT 1 FROM post_observations WHERE post_slug=${slug} AND lease_token=${leaseToken}) ON CONFLICT DO NOTHING`,
      sql`INSERT INTO participant_notifications(id,event_id,subject,created_at,email_state) SELECT lower(hex(randomblob(16))),e.id,f.subject,e.created_at,CASE WHEN c.email IS NOT NULL AND c.email_enabled=1 THEN 'pending' ELSE 'skipped' END FROM post_events e JOIN post_follows f ON f.post_slug=e.post_slug LEFT JOIN participant_contacts c ON c.subject=f.subject WHERE e.id IN(SELECT json_extract(value,'$.id') FROM json_each(${payload})) AND f.followed_at < e.created_at AND f.subject != COALESCE(e.actor_subject,'') AND EXISTS(SELECT 1 FROM post_observations WHERE post_slug=${slug} AND lease_token=${leaseToken}) ON CONFLICT(event_id,subject) DO NOTHING`,
      checkpoint,
    ];
    const dialect = new SQLiteAsyncDialect();
    // D1 batches are transactions; Drizzle compiles every bound parameter.
    await options.database.batch(
      statements.map((statement) => {
        const query = dialect.sqlToQuery(statement);
        return options.database.prepare(query.sql).bind(...query.params);
      }),
    );
  };
  return {
    async follow(slug: string, following: boolean) {
      const person = identity();
      if (following) {
        const post = await published(slug);
        await db.run(
          sql`INSERT INTO post_observations(post_slug,status,checked_at) VALUES(${slug},${post.status},${now()}) ON CONFLICT DO NOTHING`,
        );
        await db.run(
          sql`INSERT INTO post_follows(post_slug,subject,followed_at) VALUES(${slug},${person.subject},${now()}) ON CONFLICT DO NOTHING`,
        );
      } else
        await db.run(
          sql`DELETE FROM post_follows WHERE post_slug=${slug} AND subject=${person.subject}`,
        );
      return { following };
    },
    async followState(slug: string) {
      const person = identity();
      await published(slug);
      const row = await db.get(
        sql`SELECT 1 FROM post_follows WHERE post_slug=${slug} AND subject=${person.subject}`,
      );
      return { following: Boolean(row) };
    },
    async preferences() {
      const person = identity();
      const contact = await db.get<{
        email: string | null;
        email_enabled: number;
      }>(
        sql`SELECT email,email_enabled FROM participant_contacts WHERE subject=${person.subject}`,
      );
      return {
        emailAvailable: Boolean(options.email && contact?.email),
        emailEnabled: Boolean(contact?.email_enabled),
      };
    },
    async setEmailPreference(enabled: boolean) {
      const person = identity();
      const contact = await db.get<{ email: string | null }>(
        sql`SELECT email FROM participant_contacts WHERE subject=${person.subject}`,
      );
      if (enabled && (!options.email || !contact?.email))
        throw new Error(
          "Email notifications require a verified application email and a configured sender.",
        );
      await db.run(
        sql`UPDATE participant_contacts SET email_enabled=${enabled ? 1 : 0} WHERE subject=${person.subject}`,
      );
    },
    async unsubscribe(token: string) {
      if (!options.email || token.length > 256)
        throw new Error("Invalid unsubscribe link.");
      const [id, mac, extra] = token.split(".");
      if (!id || !mac || extra || !/^[a-f0-9]{32}$/.test(id))
        throw new Error("Invalid unsubscribe link.");
      const expected = Buffer.from(
        unsubscribeMac(id, options.email.unsubscribeSecret),
      );
      const received = Buffer.from(mac);
      if (
        received.length !== expected.length ||
        !timingSafeEqual(received, expected)
      )
        throw new Error("Invalid unsubscribe link.");
      await db.run(
        sql`UPDATE participant_contacts SET email_enabled=0 WHERE subject IN(SELECT subject FROM participant_notifications WHERE id=${id})`,
      );
    },
    async deliverEmails() {
      if (!options.email) return { sent: 0, failed: 0 };
      const email = options.email;
      if (email.unsubscribeSecret.length < 32)
        throw new Error(
          "Notification signing secret must contain at least 32 characters.",
        );
      const rows = await db.all<{
        id: string;
        subject: string;
        post_slug: string;
        title: string;
        message: string;
        attempts: number;
        created_at: number;
      }>(
        sql`SELECT n.id,n.subject,e.post_slug,e.title,e.message,n.attempts,n.created_at FROM participant_notifications n JOIN post_events e ON n.event_id=e.id WHERE n.email_state='pending' AND n.next_attempt_at <= ${now()} AND n.lease_until <= ${now()} ORDER BY n.created_at,n.id LIMIT 20`,
      );
      let sent = 0,
        failed = 0;
      for (const row of rows) {
        const leaseToken = randomUUID();
        const lease = await db.get<{ attempts: number }>(
          sql`UPDATE participant_notifications SET lease_until=${now() + 60000},lease_token=${leaseToken} WHERE id=${row.id} AND email_state='pending' AND next_attempt_at <= ${now()} AND lease_until <= ${now()} RETURNING attempts`,
        );
        if (!lease) continue;
        try {
          const contact = await db.get<{ email: string }>(
            sql`SELECT c.email FROM participant_contacts c WHERE c.subject=${row.subject} AND c.email_enabled=1 AND c.email IS NOT NULL AND EXISTS(SELECT 1 FROM post_follows f WHERE f.subject=c.subject AND f.post_slug=${row.post_slug})`,
          );
          if (
            !contact ||
            !(await visible(row.post_slug)) ||
            now() - row.created_at >= 86400000 ||
            lease.attempts >= 8
          ) {
            await db.run(
              sql`UPDATE participant_notifications SET email_state='skipped',lease_until=0,lease_token=NULL WHERE id=${row.id} AND lease_token=${leaseToken}`,
            );
            continue;
          }
          const unsubscribe = new URL(
            "/internal/connected/unsubscribe",
            email.siteUrl,
          );
          unsubscribe.searchParams.set(
            "token",
            `${row.id}.${unsubscribeMac(row.id, email.unsubscribeSecret)}`,
          );
          const postUrl = new URL(
            `/p/${encodeURIComponent(row.post_slug)}`,
            email.siteUrl,
          );
          await email.sender(
            {
              from: email.from,
              to: [contact.email],
              subject: row.title.replace(/[\r\n]/g, " ").slice(0, 120),
              text: `${row.message}\n\n${postUrl}\n\nStop email notifications: ${unsubscribe}`,
              headers: {
                "List-Unsubscribe": `<${unsubscribe}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
            },
            `feedbax-notification/${row.id}`,
          );
          await db.run(
            sql`UPDATE participant_notifications SET email_state='sent',lease_until=0,lease_token=NULL WHERE id=${row.id} AND lease_token=${leaseToken}`,
          );
          sent++;
        } catch {
          await db.run(
            sql`UPDATE participant_notifications SET attempts=attempts+1,next_attempt_at=${now() + Math.min(21600000, 60000 * 2 ** lease.attempts)},lease_until=0,lease_token=NULL WHERE id=${row.id} AND lease_token=${leaseToken}`,
          );
          failed++;
        }
      }
      return { sent, failed };
    },
    async markRead(id?: string) {
      const person = identity();
      await db.run(
        sql`UPDATE participant_notifications SET read_at=${now()} WHERE subject=${person.subject} AND (${id ?? null} IS NULL OR id=${id ?? null}) AND read_at IS NULL`,
      );
    },
    async inbox(cursor?: string) {
      const person = identity();
      let before = Number.MAX_SAFE_INTEGER,
        beforeId = "~";
      if (cursor) {
        try {
          const value = JSON.parse(Buffer.from(cursor, "base64url").toString());
          if (
            !Number.isSafeInteger(value.time) ||
            value.time < 0 ||
            typeof value.id !== "string" ||
            !/^[a-f0-9]{32}$/.test(value.id)
          )
            throw new Error();
          before = value.time;
          beforeId = value.id;
        } catch {
          throw new Error("Invalid notification cursor.");
        }
      }
      const visibility = new Map<string, boolean>();
      const isVisible = async (slug: string) => {
        if (!visibility.has(slug))
          visibility.set(slug, Boolean(await visible(slug)));
        return visibility.get(slug)!;
      };
      const items: ParticipantNotification[] = [];
      let scanned: NotificationRow | undefined;
      let more: boolean;
      do {
        const rows = await db.all<NotificationRow>(
          sql`SELECT n.id,n.created_at,n.read_at,e.post_slug,e.kind,e.title,e.message FROM participant_notifications n JOIN post_events e ON e.id=n.event_id WHERE n.subject=${person.subject} AND (n.created_at < ${before} OR (n.created_at=${before} AND n.id < ${beforeId})) ORDER BY n.created_at DESC,n.id DESC LIMIT 26`,
        );
        more = rows.length === 26;
        for (const row of rows) {
          if (items.length === 25) {
            more = true;
            break;
          }
          scanned = row;
          if (await isVisible(row.post_slug))
            items.push({
              id: row.id,
              slug: row.post_slug,
              kind: row.kind,
              title: row.title,
              message: row.message,
              createdAt: row.created_at,
              read: row.read_at !== null,
            });
        }
        if (scanned) {
          before = scanned.created_at;
          beforeId = scanned.id;
        }
      } while (more && items.length < 25);
      const counts = await db.all<{ post_slug: string; total: number }>(
        sql`SELECT e.post_slug,COUNT(*) as total FROM participant_notifications n JOIN post_events e ON n.event_id=e.id WHERE n.subject=${person.subject} AND n.read_at IS NULL GROUP BY e.post_slug`,
      );
      let unreadCount = 0;
      for (const row of counts)
        if (await isVisible(row.post_slug)) unreadCount += row.total;
      return {
        items,
        unreadCount,
        ...(more && scanned
          ? {
              nextCursor: Buffer.from(
                JSON.stringify({ time: scanned.created_at, id: scanned.id }),
              ).toString("base64url"),
            }
          : {}),
      };
    },
    async synchronize() {
      const posts = await db.all<{
        post_slug: string;
        status: string;
        comment_cursor: string | null;
      }>(
        sql`SELECT post_slug,status,comment_cursor FROM post_observations o WHERE lease_until <= ${now()} AND EXISTS(SELECT 1 FROM post_follows f WHERE f.post_slug=o.post_slug) ORDER BY checked_at,post_slug LIMIT 10`,
      );
      let checked = 0,
        failed = 0;
      for (const observation of posts) {
        const leaseToken = randomUUID();
        const lease = await db.get<{
          status: string;
          comment_cursor: string | null;
        }>(
          sql`UPDATE post_observations SET lease_until=${now() + 120000},lease_token=${leaseToken} WHERE post_slug=${observation.post_slug} AND lease_until <= ${now()} RETURNING status,comment_cursor`,
        );
        if (!lease) continue;
        try {
          const post = await visible(observation.post_slug);
          if (post) {
            const events: ObservedEvent[] = [];
            if (post.status !== lease.status)
              events.push({
                id: eventId(
                  `status:${post.slug}:${post.updatedAt.toISOString()}:${post.status}`,
                ),
                slug: post.slug,
                kind: "status",
                title: post.title,
                message: `Status changed to ${post.status}.`,
                createdAt: post.updatedAt.getTime(),
              });
            await record(
              events,
              post.slug,
              leaseToken,
              sql`UPDATE post_observations SET status=${post.status} WHERE post_slug=${post.slug} AND lease_token=${leaseToken}`,
            );
            events.length = 0;
            const page = await options.feedback.listCommentThreads({
              slug: post.slug,
              cursor: lease.comment_cursor ?? undefined,
            });
            const comments = page.items.flatMap((thread) => thread.comments);
            const ids = JSON.stringify(comments.map((comment) => comment.id));
            const authors = comments.length
              ? await db.all<{ comment_id: string; subject: string }>(
                  sql`SELECT comment_id,subject FROM comment_attribution WHERE comment_id IN(SELECT value FROM json_each(${ids}))`,
                )
              : [];
            const subjects = new Map(
              authors.map((author) => [author.comment_id, author.subject]),
            );
            for (const comment of comments)
              events.push({
                id: eventId(`comment:${post.slug}:${comment.id}`),
                slug: post.slug,
                kind: "comment",
                title: post.title,
                message: "A new Comment was added.",
                createdAt: comment.createdAt.getTime(),
                actor: subjects.get(comment.id),
              });
            await record(
              events,
              post.slug,
              leaseToken,
              sql`UPDATE post_observations SET comment_cursor=${page.nextCursor ?? null} WHERE post_slug=${post.slug} AND lease_token=${leaseToken}`,
            );
          }
          checked++;
        } catch {
          failed++;
        } finally {
          await db.run(
            sql`UPDATE post_observations SET checked_at=${now()},lease_until=0,lease_token=NULL WHERE post_slug=${observation.post_slug} AND lease_token=${leaseToken}`,
          );
        }
      }
      return { checked, failed };
    },
  };
}

export interface ParticipantNotification {
  id: string;
  slug: string;
  kind: "status" | "comment";
  title: string;
  message: string;
  createdAt: number;
  read: boolean;
}
type NotificationRow = {
  id: string;
  created_at: number;
  read_at: number | null;
  post_slug: string;
  kind: "status" | "comment";
  title: string;
  message: string;
};
const eventId = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const unsubscribeMac = (id: string, secret: string) =>
  createHmac("sha256", secret)
    .update(`feedbax-unsubscribe-v1:${id}`)
    .digest("base64url");
