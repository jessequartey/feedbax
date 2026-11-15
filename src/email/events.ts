import { notifyQueue } from "../notifications/queue.ts";
import { env, waitUntil } from "cloudflare:workers";
import config from "../../feedbax.config.ts";
import type { Status } from "../contracts/domain.ts";
import type { EmailMessage } from "../contracts/sync.ts";
import { inArray } from "drizzle-orm";
import { createDb } from "../db/client.ts";
import { syncState } from "../db/schema.ts";
import { emailFailure } from "./state.ts";
import { richText } from "./content.ts";

// The producer side of email notifications. Events become `email.*` queue messages here;
// the consumer (deliver.ts) picks recipients and sends. With email off nothing is queued,
// so a portal without `npx feedbax add email` behaves exactly as before.

/** Email is on only when both the from-address (config) and the Resend key (secret) are set. */
export function emailEnabled(
  bindings: Pick<Cloudflare.Env, "RESEND_API_KEY"> = env,
  settings = config,
): boolean {
  return settings.notifications.email !== false && Boolean(bindings.RESEND_API_KEY?.trim());
}

/** `post.body` is the stored Markdown; it becomes `{ markdown, text }` only when email is on. */
export type StatusChange = {
  post: { id: string; title: string; body: string };
  from: Status;
  to: Status;
};

/** `email.status` messages for status changes, or none when email is off. */
export function statusEmails(changes: StatusChange[]): EmailMessage[] {
  if (!emailEnabled()) return [];
  return changes
    .filter((change) => change.from !== change.to)
    .map((change) => ({
      type: "email.status",
      id: crypto.randomUUID(),
      ...change,
      post: { ...change.post, body: richText(change.post.body) },
    }));
}

export const EMAIL_OUTBOX_PREFIX = "email.outbox/";

/** Persist before enqueue; cron recovers failed enqueues using its existing state read. */
export async function queueEmails(messages: EmailMessage[]): Promise<void> {
  const db = createDb(env.DB);
  // Three binds per row: comfortably below D1's 100-parameter limit. Bound batch
  // bytes too: Queue sendBatch accepts at most 256 KiB across all messages.
  const chunks: EmailMessage[][] = [];
  let bytes = 0;
  for (const message of messages) {
    const size = new TextEncoder().encode(JSON.stringify(message)).length;
    if (!chunks.length || chunks.at(-1)!.length >= 20 || bytes + size > 200_000) {
      chunks.push([]);
      bytes = 0;
    }
    chunks.at(-1)!.push(message);
    bytes += size;
  }
  for (const chunk of chunks) {
    const rows = chunk.map((message) => ({
      key: `${EMAIL_OUTBOX_PREFIX}${message.type}/${message.id}/${message.after ?? "-"}`,
      value: JSON.stringify(message),
      updatedAt: Date.now(),
    }));
    try {
      await db.insert(syncState).values(rows).onConflictDoNothing();
      await notifyQueue().sendBatch(chunk.map((body) => ({ body })));
      await db.delete(syncState).where(
        inArray(
          syncState.key,
          rows.map((row) => row.key),
        ),
      );
    } catch (error) {
      console.error({ type: "email.enqueue_failed", count: chunk.length });
      await emailFailure(error).catch(() => undefined);
    }
  }
}

/** Fire-and-forget variant for request handlers (a new comment). */
export function queueEmailsLater(messages: EmailMessage[]): void {
  if (messages.length) waitUntil(queueEmails(messages));
}

/** The digest goes out with the first cron tick at or after this UTC hour each day. */
export const DIGEST_HOUR_UTC = 9;
const DAY = 86_400_000;

/**
 * Cron helper: the `email.digest` message due at `now`, or null. `last` is the previous
 * digest's `until` (sync_state `email.digest`). The first digest covers the last 24 hours;
 * after a long gap (email was off) it covers at most a week.
 */
export function digestDue(
  last: string | undefined,
  now: number,
): Extract<EmailMessage, { type: "email.digest" }> | null {
  const today = new Date(now);
  let slot = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
    DIGEST_HOUR_UTC,
  );
  if (slot > now) slot -= DAY;
  const previous = last ? Date.parse(last) : Number.NaN;
  if (Number.isFinite(previous) && previous >= slot) return null;
  const since = Number.isFinite(previous) ? Math.max(previous, slot - 7 * DAY) : slot - DAY;
  return {
    type: "email.digest",
    // Deterministic: a tick that queued the digest but failed to record it re-queues the
    // same id, and Resend's idempotency key drops the duplicate send.
    id: `digest-${new Date(slot).toISOString().slice(0, 10)}`,
    since: new Date(since).toISOString(),
    until: new Date(slot).toISOString(),
  };
}
