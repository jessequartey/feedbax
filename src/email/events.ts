import { notifyQueue } from "../notifications/queue.ts";
import { env, waitUntil } from "cloudflare:workers";
import config from "../../feedbax.config.ts";
import type { Status } from "../contracts/domain.ts";
import type { EmailMessage } from "../contracts/sync.ts";
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

/**
 * Queue email messages after the change they describe is stored. Best effort: email must
 * never fail or retry the write that caused it (a retried poll would not see the change
 * again), so a Queue failure is logged and dropped.
 */
export async function queueEmails(messages: EmailMessage[]): Promise<void> {
  if (!messages.length) return;
  try {
    await notifyQueue().sendBatch(messages.map((body) => ({ body })));
  } catch {
    console.error({ type: "email.enqueue_failed", count: messages.length });
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
  const since = Number.isFinite(previous) ? Math.max(previous, now - 7 * DAY) : now - DAY;
  return {
    type: "email.digest",
    // Deterministic: a tick that queued the digest but failed to record it re-queues the
    // same id, and Resend's idempotency key drops the duplicate send.
    id: `digest-${new Date(slot).toISOString().slice(0, 10)}`,
    since: new Date(since).toISOString(),
    until: new Date(now).toISOString(),
  };
}
