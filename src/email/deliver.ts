import { notifyQueue } from "../notifications/queue.ts";
import { env } from "cloudflare:workers";
import { and, asc, desc, eq, gt, gte, inArray, lt, sql, type SQL } from "drizzle-orm";
import config from "../../feedbax.config.ts";
import type { NotificationToggles } from "../contracts/admin.ts";
import type { EmailMessage } from "../contracts/sync.ts";
import { createDb } from "../db/client.ts";
import { changelogEntries, comments, emailPrefs, posts, syncState, user } from "../db/schema.ts";
import { effectiveSettings } from "../server/settings.ts";
import { publiclyVisible } from "../server/visibility.ts";
import { richText } from "./content.ts";
import { emailEnabled } from "./events.ts";
import { deliveryKey, emailFailure, emailSuccess } from "./state.ts";
import { reachable, wants } from "./prefs.ts";
import { EmailError, sendBatch, type OutgoingEmail } from "./resend.ts";
import {
  changelogEmail,
  digestEmail,
  replyEmail,
  statusEmail,
  type Frame,
  type Rendered,
} from "./templates.ts";
import {
  UNSUBSCRIBE_PAGE,
  UNSUBSCRIBE_PATH,
  unsubscribeQuery,
  type EmailKind,
} from "./unsubscribe.ts";

// The consumer side of email notifications: one queue message = one event. It re-checks
// that email is on and the admin's site switch for that kind, picks the recipients in D1
// (reachable, wanting this kind), renders one email each with its own signed unsubscribe
// link, and sends them in Resend batches. Hidden, spam and merged posts send nothing.

/** Recipients handled per message; a larger audience continues in a follow-up message. */
export const EMAIL_SLICE = 8;
/** Posts listed in a digest (the total is still counted). */
export const DIGEST_ITEMS = 20;

type Recipient = { id: string; email: string };
type Audience = { kind: EmailKind; where: SQL; after?: string };

type Delivery =
  | { state: "pending"; email: OutgoingEmail; at: number }
  | { state: "sent" | "failed" | "skipped" };

const SITE_SWITCH: Record<EmailMessage["type"], keyof NotificationToggles> = {
  "email.status": "statusChanges",
  "email.reply": "replies",
  "email.digest": "adminDigest",
  "email.changelog": "changelog",
};

function portal(): string {
  return env.PORTAL_URL.replace(/\/+$/, "");
}

async function recipients(audience: Audience): Promise<Recipient[]> {
  return createDb(env.DB)
    .select({ id: user.id, email: user.email })
    .from(user)
    .leftJoin(emailPrefs, eq(emailPrefs.userId, user.id))
    .where(
      and(
        audience.where,
        reachable,
        wants(audience.kind),
        audience.after === undefined ? undefined : gt(user.id, audience.after),
      ),
    )
    .orderBy(asc(user.id))
    .limit(EMAIL_SLICE + 1);
}

/**
 * Render and send to one slice of the audience, then queue the next slice if there is one.
 * A retry re-runs the same slice with the same idempotency keys, so completed recipients are skipped.
 */
async function send(
  message: EmailMessage,
  audience: Audience,
  render: (recipient: Recipient, frame: Frame) => Rendered,
  reason: (recipient: Recipient) => string,
  portalName: string,
): Promise<void> {
  const db = createDb(env.DB);
  const from = config.notifications.email;
  if (!from) return;
  const found = await recipients(audience);
  const slice = found.slice(0, EMAIL_SLICE);
  const candidates: { key: string; value: string; updatedAt: number }[] = [];
  for (const recipient of slice) {
    const query = await unsubscribeQuery(env.BETTER_AUTH_SECRET, recipient.id, audience.kind);
    const frame: Frame = {
      portalName,
      reason: reason(recipient),
      unsubscribeUrl: `${portal()}${UNSUBSCRIBE_PAGE}?${query}`,
      preferencesUrl: `${portal()}/notifications`,
    };
    const email: OutgoingEmail = {
      from: from.from,
      to: recipient.email,
      ...render(recipient, frame),
      headers: {
        "List-Unsubscribe": `<${portal()}${UNSUBSCRIBE_PATH}?${query}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    };
    candidates.push({
      key: await deliveryKey(`${message.type}/${message.id}`, recipient.id),
      value: JSON.stringify({ state: "pending", email, at: Date.now() } satisfies Delivery),
      updatedAt: Date.now(),
    });
  }
  if (!candidates.length) return;
  // At most 24 binds per INSERT and 8 per IN. Concurrent redeliveries use the
  // winning immutable payload, even if settings, digest contents or email changed.
  await db.insert(syncState).values(candidates).onConflictDoNothing();
  const saved = await db
    .select()
    .from(syncState)
    .where(
      inArray(
        syncState.key,
        candidates.map((row) => row.key),
      ),
    );
  const deliveries = new Map(saved.map((row) => [row.key, JSON.parse(row.value) as Delivery]));
  let failure: EmailError | undefined;
  let succeeded = false;
  for (let index = 0; index < slice.length; index++) {
    const recipient = slice[index]!;
    const key = candidates[index]!.key;
    const delivery = deliveries.get(key)!;
    if (delivery.state !== "pending") continue;
    // Check immediately before each provider call, including retries of saved payloads.
    const eligible = await db
      .select({ email: user.email })
      .from(user)
      .leftJoin(emailPrefs, eq(emailPrefs.userId, user.id))
      .where(and(eq(user.id, recipient.id), reachable, wants(audience.kind)))
      .get();
    if (!eligible || eligible.email !== delivery.email.to) {
      await db
        .update(syncState)
        .set({ value: JSON.stringify({ state: "skipped" }), updatedAt: Date.now() })
        .where(eq(syncState.key, key));
      continue;
    }
    let state: "sent" | "failed" = "sent";
    try {
      // An unknown outcome after the provider's 24h retention cannot be safely replayed.
      // Surface it for the operator rather than risk sending the same email twice.
      if (Date.now() - delivery.at >= 24 * 60 * 60 * 1000)
        throw new EmailError(null, false, undefined, "idempotency_expired");
      await sendBatch(env.RESEND_API_KEY!, [delivery.email], key);
      succeeded = true;
    } catch (error) {
      if (!(error instanceof EmailError) || error.transient) throw error;
      failure = error;
      console.error({
        type: "email.failure",
        status: error.status,
        code: error.code,
        classification: "permanent",
      });
      state = "failed";
    }
    // Discard payloads/addresses once terminal. Retain the tiny tombstone so a late
    // redelivery does not depend on Resend's expiring deduplication cache.
    await db
      .update(syncState)
      .set({ value: JSON.stringify({ state }), updatedAt: Date.now() })
      .where(eq(syncState.key, key));
  }
  if (failure) await emailFailure(failure);
  else if (succeeded) await emailSuccess();
  if (found.length > EMAIL_SLICE)
    await notifyQueue().send({ ...message, after: slice[slice.length - 1]!.id });
}

async function deliver(message: EmailMessage): Promise<void> {
  const settings = await effectiveSettings();
  if (!settings.notifications[SITE_SWITCH[message.type]]) return;
  const db = createDb(env.DB);
  const postUrl = (id: string) => `${portal()}/posts/${id}`;
  switch (message.type) {
    case "email.status": {
      const post = await db
        .select({ authorId: posts.authorId })
        .from(posts)
        .where(and(eq(posts.id, message.post.id), publiclyVisible))
        .get();
      if (!post) return;
      await send(
        message,
        {
          kind: "status",
          after: message.after,
          where: sql`${user.id} IN (SELECT author_id FROM posts WHERE id = ${message.post.id} UNION SELECT user_id FROM votes WHERE post_id = ${message.post.id})`,
        },
        (recipient, frame) =>
          statusEmail(frame, {
            title: message.post.title,
            body: message.post.body,
            from: message.from,
            to: message.to,
            url: postUrl(message.post.id),
            author: recipient.id === post.authorId,
          }),
        (recipient) =>
          `You get this because you ${recipient.id === post.authorId ? "wrote" : "voted on"} this post.`,
        settings.name,
      );
      return;
    }
    case "email.reply": {
      // Still there and still public? A deleted comment or hidden post sends nothing.
      const found = await db
        .select({ authorId: posts.authorId, createdAt: comments.createdAt })
        .from(comments)
        .innerJoin(posts, eq(posts.id, comments.postId))
        .where(
          and(eq(comments.id, message.comment.id), eq(posts.id, message.post.id), publiclyVisible),
        )
        .get();
      if (!found) return;
      await send(
        message,
        {
          kind: "replies",
          after: message.after,
          where: sql`${user.id} <> ${message.comment.authorId} AND ${user.id} IN (SELECT author_id FROM posts WHERE id = ${message.post.id} UNION SELECT author_id FROM comments WHERE post_id = ${message.post.id} AND created_at <= ${found.createdAt} AND id <> ${message.comment.id})`,
        },
        (recipient, frame) =>
          replyEmail(frame, {
            title: message.post.title,
            authorName: message.comment.authorName,
            body: message.comment.body,
            url: postUrl(message.post.id),
            author: recipient.id === found.authorId,
          }),
        (recipient) =>
          `You get this because you ${recipient.id === found.authorId ? "wrote" : "commented on"} this post.`,
        settings.name,
      );
      return;
    }
    case "email.digest": {
      const window = and(
        gte(posts.createdAt, Date.parse(message.since)),
        lt(posts.createdAt, Date.parse(message.until)),
        publiclyVisible,
      );
      const [items, count] = await Promise.all([
        db
          .select({
            id: posts.id,
            title: posts.title,
            body: posts.body,
            category: posts.category,
          })
          .from(posts)
          .where(window)
          .orderBy(desc(posts.createdAt), desc(posts.id))
          .limit(DIGEST_ITEMS),
        db
          .select({ total: sql<number>`count(*)` })
          .from(posts)
          .where(window)
          .get(),
      ]);
      const total = count?.total ?? 0;
      if (!total) return;
      const digest = {
        total,
        url: `${portal()}/admin/moderation`,
        items: items.map((item) => ({
          title: item.title,
          category: item.category,
          body: richText(item.body),
          url: postUrl(item.id),
        })),
      };
      await send(
        message,
        { kind: "digest", after: message.after, where: sql`${user.role} = 'admin'` },
        (_recipient, frame) => digestEmail(frame, digest),
        () => "You get this because you are an admin of this portal.",
        settings.name,
      );
      return;
    }
    case "email.changelog": {
      // Unpublished (or deleted) since it was queued: send nothing.
      const entry = await db
        .select({ id: changelogEntries.id })
        .from(changelogEntries)
        .where(
          and(eq(changelogEntries.id, message.entry.id), eq(changelogEntries.status, "published")),
        )
        .get();
      if (!entry) return;
      await send(
        message,
        { kind: "changelog", after: message.after, where: sql`1 = 1` },
        (_recipient, frame) => changelogEmail(frame, message.entry),
        () => "You get this because you chose to get changelog emails.",
        settings.name,
      );
      return;
    }
  }
}

/** Queue consumer entry for `email.*` messages. Never touches the Notion/GitHub sync state. */
export async function consumeEmail(message: Message<EmailMessage>): Promise<void> {
  const body = message.body;
  // Turned off since it was queued: drop it.
  if (!emailEnabled()) {
    message.ack();
    return;
  }
  try {
    await deliver(body);
    message.ack();
  } catch (error) {
    const email = error instanceof EmailError ? error : null;
    const permanent = email !== null && !email.transient;
    console.error({
      type: "email.failure",
      operation: body.type,
      status: email?.status ?? null,
      classification: permanent ? "permanent" : email ? "transient" : "storage",
      correlationId: crypto.randomUUID(),
    });
    await emailFailure(error).catch(() => undefined);
    if (permanent) {
      // A bad key, sender or address will not fix itself by retrying.
      message.ack();
      return;
    }
    const backoff = Math.min(60 * 2 ** Math.min(Math.max(message.attempts - 1, 0), 6), 3600);
    message.retry({
      delaySeconds: Math.min(86_400, Math.max(backoff, email?.retryAfterSeconds ?? 0)),
    });
  }
}
