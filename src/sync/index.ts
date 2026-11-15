import { inArray, lt, sql } from "drizzle-orm";
import { IntegrationError } from "../contracts/integrations.ts";
import {
  isNotifyMessage,
  type NotifyMessage,
  type SyncErrorState,
  type SyncMessage,
} from "../contracts/sync.ts";
import { syncState, usedTokens } from "../db/schema.ts";
import { advanceState, config, db, env, providerPaused, watermark, writeState } from "./shared.ts";
import { archiveNotionPage, mirrorPost, pollNotion } from "./notion.ts";
import { createIssue, pollGitHub } from "./github.ts";
import { consumeNotification } from "../notifications/consume.ts";
import { notifyQueue } from "../notifications/queue.ts";
import { digestDue, emailEnabled } from "../email/events.ts";

export async function consumeQueue(batch: MessageBatch<SyncMessage>): Promise<void> {
  // Keep processing sequential even if a larger batch is delivered accidentally.
  for (const message of batch.messages) {
    const body = message.body;
    if (isNotifyMessage(body)) {
      // Drain deliveries queued before the notification binding was provisioned.
      await consumeNotification(message as Message<NotifyMessage>);
      continue;
    }
    if (body.type.startsWith("github.") && !config.integrations.github) {
      message.ack();
      continue;
    }
    try {
      switch (body.type) {
        case "notion.post":
          await mirrorPost(body.postId);
          break;
        case "notion.archive":
          await archiveNotionPage(body.pageId);
          break;
        case "notion.poll":
          await pollNotion(body);
          break;
        case "github.issue":
          await createIssue(body.postId);
          break;
        case "github.poll":
          await pollGitHub(body);
          break;
      }
      message.ack();
    } catch (error) {
      const provider = body.type.startsWith("notion.") ? "notion" : "github";
      // D1/Queue failures also need retry; do not expose their raw messages.
      const failure =
        error instanceof IntegrationError
          ? error
          : new IntegrationError(
              provider,
              "transient",
              null,
              null,
              "Sync storage or queue operation failed.",
              "storage",
            );
      const diagnostic = {
        type: "sync.failure",
        operation: body.type,
        ...("postId" in body ? { postId: body.postId } : {}),
        status: failure.status,
        code: failure.kind,
        classification: failure.classification,
        correlationId: crypto.randomUUID(),
      };
      console.error(diagnostic);
      const state = {
        status: failure.status,
        code: failure.kind,
        message: failure.message,
        at: new Date().toISOString(),
        type: body.type,
      } satisfies SyncErrorState;
      const transient = failure.kind === "transient" || failure.kind === "rate_limit";
      if (transient) {
        const backoff = Math.min(30 * 2 ** Math.min(Math.max(message.attempts - 1, 0), 7), 3600);
        // Cloudflare caps a per-message retry delay at 24 hours.
        const delaySeconds = Math.min(
          86_400,
          Math.max(backoff, Math.ceil((failure.retryAfterMs ?? 0) / 1000)),
        );
        message.retry({ delaySeconds });
        // While this message backs off, the cron sends this provider nothing new: the retry
        // is the probe, and its success clears the backoff. Capped at an hour so polling
        // resumes even if the retry is lost. Best effort: D1 itself may be what failed.
        await advanceState(
          `${provider}.backoff`,
          new Date(Date.now() + Math.min(delaySeconds, 3600) * 1000).toISOString(),
        ).catch(() => undefined);
        await writeState(`${provider}.error`, state).catch(() => undefined);
      } else {
        await writeState(`${provider}.error`, state);
        message.ack();
      }
    }
  }
}

const STATE_KEYS = [
  ...["notion", "github"].flatMap((provider) =>
    ["error", "backoff", "watermark"].map((name) => `${provider}.${name}`),
  ),
  // The previous admin digest's `until` (email notifications).
  "email.digest",
];

/**
 * Cron: cheap D1 reads and one sync Queue call, plus one notify call when a digest is due.
 * External I/O stays in the consumer.
 * An idle tick is 2 D1 statements (4–5 with GitHub) and one `sendBatch` of the polls.
 */
export async function runScheduled(controller: ScheduledController): Promise<void> {
  const now = controller.scheduledTime;
  const database = db();
  const [, rows] = await database.batch([
    database.delete(usedTokens).where(lt(usedTokens.expiresAt, now)),
    database.select().from(syncState).where(inArray(syncState.key, STATE_KEYS)),
  ]);
  const state = new Map(rows.map((row) => [row.key, JSON.parse(row.value) as unknown]));
  const error = (provider: string) => state.get(`${provider}.error`) as SyncErrorState | undefined;
  const backedOff = (provider: string) =>
    Date.parse((state.get(`${provider}.backoff`) as string | undefined) ?? "") > now;
  const since = (provider: string) => {
    const previous = state.get(`${provider}.watermark`) as string | undefined;
    return new Date(Math.max(0, (previous ? Date.parse(previous) : 0) - 120_000)).toISOString();
  };
  const until = new Date(now).toISOString();
  // INDEXED BY pins the partial indexes: SQLite would otherwise pick a full-width index
  // (e.g. github_number IS NULL) and read every unsynced row.
  const pendingIds = async (query: ReturnType<typeof sql>) =>
    (await database.all<{ id: string }>(query)).map((row) => row.id);
  const notion = !backedOff("notion");
  const github = !!config.integrations.github && !backedOff("github");
  const sweep: SyncMessage[] = [];
  if (notion && !providerPaused(error("notion"), now))
    for (const postId of await pendingIds(
      sql`SELECT id FROM posts INDEXED BY posts_notion_pending WHERE notion_blocked = 0 AND (notion_page_id IS NULL OR notion_revision < revision) ORDER BY updated_at, id LIMIT 25`,
    ))
      sweep.push({ type: "notion.post", postId });
  let githubWork = false;
  if (github) {
    if (!providerPaused(error("github"), now))
      for (const postId of await pendingIds(
        sql`SELECT id FROM posts INDEXED BY posts_github_pending WHERE github_requested = 1 AND github_number IS NULL LIMIT 10`,
      )) {
        sweep.push({ type: "github.issue", postId });
        githubWork = true;
      }
    // Only an open linked issue can be closed into Done. With none (and no pending approval
    // or recorded error to probe), skip the GitHub call and move its watermark instead, so
    // the next real poll starts from now rather than paging through old closed issues.
    githubWork ||=
      !!error("github") ||
      (
        await pendingIds(
          sql`SELECT id FROM posts INDEXED BY posts_github_open WHERE github_number IS NOT NULL AND github_closed_at IS NULL LIMIT 1`,
        )
      ).length > 0;
    if (!githubWork) await watermark("github", until);
  }
  // Once a day, when email is on: the admin digest (src/email/events.ts).
  const digest = emailEnabled()
    ? digestDue(state.get("email.digest") as string | undefined, now)
    : null;
  const messages: SyncMessage[] = [
    ...sweep,
    ...(notion
      ? [{ type: "notion.poll", since: since("notion"), until, cursor: null } as const]
      : []),
    ...(github && githubWork
      ? [{ type: "github.poll", since: since("github"), until, page: 1 } as const]
      : []),
  ];
  // No extra idle-tick work; only a due digest sends to the notification queue.
  if (messages.length) await env.SYNC_QUEUE.sendBatch(messages.map((body) => ({ body })));
  if (digest) {
    await notifyQueue().send(digest);
    await writeState("email.digest", digest.until);
  }
}
