import { eq, isNull, lt, or, and } from "drizzle-orm";
import { IntegrationError } from "../contracts/integrations.ts";
import type { SyncMessage } from "../contracts/sync.ts";
import { usedTokens } from "../db/schema.ts";
import { config, db, env, posts, providerPaused, readState, writeState } from "./shared.ts";
import { mirrorPost, pollNotion } from "./notion.ts";
import { createIssue, pollGitHub } from "./github.ts";

export async function consumeQueue(batch: MessageBatch<SyncMessage>): Promise<void> {
  // Keep processing sequential even if a larger batch is delivered accidentally.
  for (const message of batch.messages) {
    const body = message.body;
    if (body.type.startsWith("github.") && !config.integrations.github) {
      message.ack();
      continue;
    }
    try {
      switch (body.type) {
        case "notion.post":
          await mirrorPost(body.postId);
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
            );
      const transient = failure.kind === "transient" || failure.kind === "rate_limit";
      if (transient) {
        const backoff = Math.min(30 * 2 ** Math.min(Math.max(message.attempts - 1, 0), 7), 3600);
        // Cloudflare caps a per-message retry delay at 24 hours.
        message.retry({
          delaySeconds: Math.min(
            86_400,
            Math.max(backoff, Math.ceil((failure.retryAfterMs ?? 0) / 1000)),
          ),
        });
      } else {
        await writeState(`${provider}.error`, {
          status: failure.status,
          code: failure.kind,
          message: failure.message,
          at: new Date().toISOString(),
        });
        console.error({
          type: body.type,
          ...("postId" in body ? { postId: body.postId } : {}),
          status: failure.status,
        });
        message.ack();
      }
    }
  }
}

export async function runScheduled(controller: ScheduledController): Promise<void> {
  const now = controller.scheduledTime;
  const database = db();
  await database.delete(usedTokens).where(lt(usedTokens.expiresAt, now));
  if (!(await providerPaused("notion", now))) {
    const pending = await database
      .select({ id: posts.id })
      .from(posts)
      .where(or(isNull(posts.notionPageId), lt(posts.notionRevision, posts.revision)))
      .limit(25);
    for (const post of pending)
      await env.SYNC_QUEUE.send({ type: "notion.post", postId: post.id } satisfies SyncMessage);
  }
  if (config.integrations.github && !(await providerPaused("github", now))) {
    const pending = await database
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.githubRequested, 1), isNull(posts.githubNumber)))
      .limit(10);
    for (const post of pending)
      await env.SYNC_QUEUE.send({ type: "github.issue", postId: post.id } satisfies SyncMessage);
  }
  const until = new Date(now).toISOString();
  const since = async (provider: string) => {
    const previous = await readState<string>(`${provider}.watermark`);
    return new Date(Math.max(0, (previous ? Date.parse(previous) : 0) - 120_000)).toISOString();
  };
  await env.SYNC_QUEUE.send({
    type: "notion.poll",
    since: await since("notion"),
    until,
    cursor: null,
  } satisfies SyncMessage);
  if (config.integrations.github)
    await env.SYNC_QUEUE.send({
      type: "github.poll",
      since: await since("github"),
      until,
      page: 1,
    } satisfies SyncMessage);
}
