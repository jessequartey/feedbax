import { vi } from "vite-plus/test";
import { env } from "cloudflare:workers";
import config from "../../feedbax.config.ts";
import type { EmailMessage } from "../../src/contracts/sync.ts";
import { createDb } from "../../src/db/client.ts";
import { comments, posts, user, votes } from "../../src/db/schema.ts";
import { consumeEmail } from "../../src/email/deliver.ts";
import { queue } from "../fixtures/cloudflare-workers.ts";

export const FROM = "Feedbax <feedback@example.com>";

/** Email on: the config from-address and the Resend key, both set (the only way it turns on). */
export function enableEmail() {
  config.notifications.email = { from: FROM };
  env.RESEND_API_KEY = "re_test_only_not_a_real_key";
}
export function disableEmail() {
  config.notifications.email = false;
  delete env.RESEND_API_KEY;
}

export type SentEmail = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
};
export type ResendCall = { url: string; headers: Headers; emails: SentEmail[] };

/**
 * Replaces `fetch`: records Resend batch calls and answers with `statuses` in turn (200 when
 * they run out). Nothing leaves the process. The caller restores it (`vi.unstubAllGlobals`).
 */
export function stubResend(...statuses: number[]) {
  const calls: ResendCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (!url.startsWith("https://api.resend.com/")) throw new Error(`Unexpected fetch ${url}`);
      calls.push({
        url,
        headers: new Headers(init?.headers),
        emails: JSON.parse(init?.body as string) as SentEmail[],
      });
      return Response.json({ data: [] }, { status: statuses.shift() ?? 200 });
    }),
  );
  return {
    calls,
    emails: () => calls.flatMap((call) => call.emails),
    to: () => calls.flatMap((call) => call.emails.flatMap((email) => email.to)).sort(),
  };
}

export async function account(
  id: string,
  patch: Partial<typeof user.$inferInsert> = {},
): Promise<string> {
  await createDb(env.DB)
    .insert(user)
    .values({
      id,
      name: id,
      email: `${id}@example.com`,
      emailVerified: true,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      ...patch,
    });
  return id;
}
export async function post(
  id: string,
  authorId: string,
  patch: Partial<typeof posts.$inferInsert> = {},
) {
  await createDb(env.DB)
    .insert(posts)
    .values({
      id,
      authorId,
      title: "Export to CSV",
      body: "Please let me export my data.",
      category: "feature",
      createdAt: 1,
      updatedAt: 1,
      ...patch,
    });
}
export const vote = (postId: string, userId: string) =>
  createDb(env.DB).insert(votes).values({ postId, userId, createdAt: 2 });
export const comment = (id: string, postId: string, authorId: string, createdAt: number) =>
  createDb(env.DB).insert(comments).values({ id, postId, authorId, body: "A comment", createdAt });
export const setPrefs = (userId: string, prefs: Record<string, number>) => {
  const columns = Object.keys(prefs);
  return env.DB.prepare(
    `INSERT INTO email_prefs (user_id, ${columns.join(", ")}, unsubscribe_token, updated_at) VALUES (?, ${columns.map(() => "?").join(", ")}, ?, 0)`,
  )
    .bind(userId, ...Object.values(prefs), crypto.randomUUID())
    .run();
};

/** The email messages the app has put on the queue so far. */
export const queued = () =>
  queue.sent.filter((message): message is EmailMessage => message.type.startsWith("email."));

/** Run one message through the consumer like the queue would. */
export async function consume(body: EmailMessage, attempts = 1) {
  const ack = vi.fn();
  const retry = vi.fn();
  await consumeEmail({
    id: "m",
    timestamp: new Date(),
    body,
    attempts,
    ack,
    retry,
  } as unknown as Message<EmailMessage>);
  return { ack, retry };
}
