import { env, waitUntil } from "cloudflare:workers";
import config from "../../feedbax.config.ts";
import type { Status } from "../contracts/domain.ts";
import type { EmailMessage, EmailPost } from "../contracts/sync.ts";

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

export type StatusChange = { post: EmailPost; from: Status; to: Status };

/** `email.status` messages for status changes, or none when email is off. */
export function statusEmails(changes: StatusChange[]): EmailMessage[] {
  if (!emailEnabled()) return [];
  return changes
    .filter((change) => change.from !== change.to)
    .map((change) => ({ type: "email.status", id: crypto.randomUUID(), ...change }));
}

/**
 * Queue email messages after the change they describe is stored. Best effort: email must
 * never fail or retry the write that caused it (a retried poll would not see the change
 * again), so a Queue failure is logged and dropped.
 */
export async function queueEmails(messages: EmailMessage[]): Promise<void> {
  if (!messages.length) return;
  try {
    await env.SYNC_QUEUE.sendBatch(messages.map((body) => ({ body })));
  } catch {
    console.error({ type: "email.enqueue_failed", count: messages.length });
  }
}

/** Fire-and-forget variant for request handlers (a new comment). */
export function queueEmailsLater(messages: EmailMessage[]): void {
  if (messages.length) waitUntil(queueEmails(messages));
}

// TODO(0.4.0-06): send changelog.published email. When 06 publishes an entry (its
// `changelog.published` hook), call
//   queueEmailsLater([{ type: "email.changelog", id: crypto.randomUUID(),
//     entry: { id, title, body: richText(markdown) } }])   // guarded by emailEnabled()
// and handle "email.changelog" in deliver.ts (recipients: `reachable` users with
// `wants("changelog")`, which defaults off; site switch `notifications.changelog`;
// unsubscribe kind "changelog"). The preference column and the /notifications toggle exist.

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
