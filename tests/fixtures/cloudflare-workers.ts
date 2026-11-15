// Test shim for the `cloudflare:workers` module (aliased in vite.config.ts → test.alias).
// `env` is built from Wrangler's getPlatformProxy(): local in-memory D1 and R2, with
// migrations/*.sql applied. The Queue is a recording fake. Secrets are test-only fixtures:
// a real .dev.vars is never read into `env`.
import { readFileSync, readdirSync } from "node:fs";
import { getPlatformProxy } from "wrangler";
import type { SyncMessage } from "../../src/contracts/sync.ts";
import { clearFeedCache } from "../../src/server/feed-cache.ts";
import { clearSettingsCache } from "../../src/server/settings-cache.ts";

const root = new URL("../../", import.meta.url);
const hostTokens = JSON.parse(
  readFileSync(new URL("tests/fixtures/host-tokens.json", root), "utf8"),
) as { secret: string };

export const TEST_SECRETS = {
  BETTER_AUTH_SECRET: "test-only-better-auth-secret-0123456789abcdef",
  FEEDBAX_HOST_SECRET: hostTokens.secret,
  NOTION_TOKEN: "ntn_test_only_not_a_real_token",
} as const;

/** Recording stand-in for the SYNC_QUEUE producer. */
export type FakeQueue = {
  sent: SyncMessage[];
  /** The next `count` sends reject, then it recovers. */
  failNext(count?: number): void;
  reset(): void;
  send(message: SyncMessage, options?: unknown): Promise<void>;
  sendBatch(messages: Iterable<{ body: SyncMessage }>): Promise<void>;
};

export function createFakeQueue(): FakeQueue {
  let failures = 0;
  const queue: FakeQueue = {
    sent: [],
    failNext: (count = 1) => {
      failures = count;
    },
    reset: () => {
      queue.sent.length = 0;
      failures = 0;
    },
    send: async (message) => {
      if (failures > 0) {
        failures -= 1;
        throw new Error("fake queue: send failed");
      }
      queue.sent.push(message);
    },
    sendBatch: async (messages) => {
      for (const { body } of messages) await queue.send(body);
    },
  };
  return queue;
}

const proxy = await getPlatformProxy<{ DB: D1Database; IMAGES: R2Bucket }>({
  configPath: new URL("wrangler.jsonc", root).pathname,
  persist: false,
});

export const queue = createFakeQueue();

export const env = {
  DB: proxy.env.DB,
  IMAGES: proxy.env.IMAGES,
  SYNC_QUEUE: queue as unknown as Queue,
  PORTAL_URL: "http://localhost:3000",
  ...TEST_SECRETS,
} as Cloudflare.Env;

const pending: Promise<unknown>[] = [];

/** Same signature as `waitUntil` from `cloudflare:workers`; the promises are collected. */
export function waitUntil(promise: Promise<unknown>): void {
  pending.push(promise.catch(() => undefined));
}

/** Await everything handed to waitUntil so far (and anything it schedules meanwhile). */
export async function flushWaitUntil(): Promise<void> {
  while (pending.length > 0) await Promise.all(pending.splice(0));
}

/** Drop-in for the `exports`/`ctx` shape some code reads from `cloudflare:workers`. */
export const exports = {};

const migrationsDir = new URL("migrations/", root);

function splitStatements(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((part) =>
      part
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter(Boolean);
}

async function applyMigrations(): Promise<void> {
  const files = readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const statements = splitStatements(readFileSync(new URL(file, migrationsDir), "utf8"));
    await env.DB.batch(statements.map((statement) => env.DB.prepare(statement)));
  }
}

await applyMigrations();

const TABLES_IN_DELETE_ORDER = [
  "post_follows",
  "changelog_posts",
  "changelog_entries",
  "webhook_deliveries",
  "webhook_endpoints",
  "email_prefs",
  "admin_link_nonces",
  "settings",
  "votes",
  "vote_budget",
  "comments",
  "images",
  "posts",
  "used_tokens",
  "sync_state",
  "rate_limit",
  "session",
  "account",
  "verification",
  "user",
];

/** Empty every table (and the fake queue and R2 bucket) between tests. */
export async function resetEnv(): Promise<void> {
  await flushWaitUntil();
  await env.DB.batch(TABLES_IN_DELETE_ORDER.map((table) => env.DB.prepare(`DELETE FROM ${table}`)));
  queue.reset();
  clearSettingsCache();
  clearFeedCache();
  let cursor: string | undefined;
  do {
    const listed = await env.IMAGES.list({ cursor });
    if (listed.objects.length > 0) await env.IMAGES.delete(listed.objects.map((o) => o.key));
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
}

/** Standalone built-worker tests release the local platform proxy when complete. */
export const disposeEnv = () => proxy.dispose();
