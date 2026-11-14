import { waitUntil } from "cloudflare:workers";
import type { ChangelogPublishedEvent } from "../contracts/changelog.ts";
import { changelogEmailSink } from "../email/changelog.ts";
import { emitChangelogWebhook } from "./webhooks.ts";

// The attachment point for "changelog.published". Webhooks and opt-in changelog email register
// below. `setChangelogStatus` (changelog.ts) calls `emitChangelogPublished` once per
// draft → published transition and never awaits it on the request path: a sink that throws
// is logged and skipped, it can never fail a publish.

export type ChangelogPublishedSink = (event: ChangelogPublishedEvent) => void | Promise<void>;

/**
 * Sinks run in order, each isolated from the others. Ticket 07: push the email fan-out
 * (enqueue one `email.changelog` queue message). Ticket 08: push the webhook enqueue for
 * event "changelog.published". Keep a sink short: enqueue work, do not do it here.
 */
export const changelogPublishedSinks: ChangelogPublishedSink[] = [];
// Webhooks: one indexed read, and nothing more when no endpoint wants the event. It only
// stores deliveries and enqueues them; the HTTP requests are made by the queue consumer.
changelogPublishedSinks.push(emitChangelogWebhook);
// Email: opt-in changelog email. Only enqueues one queue message, and only when email is on.
changelogPublishedSinks.push(changelogEmailSink);

/** Runs every sink and resolves when all settled. Safe to await in tests. */
export async function runChangelogPublished(event: ChangelogPublishedEvent): Promise<void> {
  for (const sink of changelogPublishedSinks) {
    try {
      await sink(event);
    } catch {
      // Never serialize the error: it can carry endpoint URLs or addresses.
      console.error({ type: "changelog.published.sink_failed", entryId: event.entry.id });
    }
  }
}

/** Called by the publish action. No-op until a sink is registered. */
export function emitChangelogPublished(event: ChangelogPublishedEvent): void {
  if (changelogPublishedSinks.length) waitUntil(runChangelogPublished(event));
}
