// Run after build. Use workerd, not a Node cloudflare:workers shim: runtime fetch
// options must be accepted before the outbound fixture can receive the request.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const root = resolve("dist/server");
const modules = await Promise.all(
  (await readdir(root, { recursive: true }))
    .filter((path) => path.endsWith(".js"))
    .map(async (path) => ({
      type: "ESModule" as const,
      path: resolve(root, path),
      contents: await readFile(resolve(root, path), "utf8"),
    })),
);
const postId = "11111111-1111-4111-8111-111111111111";
const pageId = "22222222-2222-4222-8222-222222222222";
const calls: string[] = [];
let redirect = false;
const runtime = new Miniflare(
  convertV4MiniflareOptions({
    modules,
    modulesRoot: root,
    compatibilityDate: "2026-11-13",
    compatibilityFlags: ["nodejs_compat"],
    bindings: {
      PORTAL_URL: "https://portal.example.com",
      NOTION_TOKEN: "test-only-runtime-token",
      BETTER_AUTH_SECRET: "test-only-runtime-secret-at-least-32-characters",
    },
    d1Databases: ["DB"],
    r2Buckets: ["IMAGES"],
    queueProducers: { SYNC_QUEUE: "sync" },
    queueConsumers: { sync: { maxBatchSize: 1, maxRetries: 0 } },
    outboundService: async (request) => {
      const url = new URL(request.url);
      calls.push(`${request.method} ${url.hostname}${url.pathname}`);
      assert.equal(url.hostname, "api.notion.com", "never follow credential-bearing redirects");
      if (redirect)
        return new Response(null, {
          status: 302,
          headers: { Location: "https://untrusted.example.com/collect" },
        });
      if (url.pathname.endsWith("/query"))
        return Response.json({ results: [], has_more: false, next_cursor: null });
      assert.equal(url.pathname, "/v1/pages");
      return Response.json({ id: pageId });
    },
  }),
);
try {
  const db = await runtime.getD1Database("DB");
  for (const file of (await readdir("migrations")).filter((p) => p.endsWith(".sql")).sort())
    for (const statement of (await readFile(resolve("migrations", file), "utf8")).split(
      "--> statement-breakpoint",
    ))
      if (statement.trim()) await db.prepare(statement).run();
  await db
    .prepare(
      "INSERT INTO user (id,name,email) VALUES ('author','Runtime','runtime@example.invalid')",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO posts (id,author_id,title,body,category,created_at,updated_at) VALUES (?,'author','Runtime','Body','feature',1,1)",
    )
    .bind(postId)
    .run();
  // Miniflare 5 beta's Fetcher replacement type omits trigger methods; workerd
  // exposes queue() on this service binding (the actual runtime call below verifies it).
  const worker = (await runtime.getWorker()) as unknown as {
    queue(
      name: string,
      messages: { id: string; timestamp: Date; attempts: number; body: unknown }[],
    ): Promise<{
      retryMessages: unknown[];
      explicitAcks: string[];
    }>;
  };
  const deliver = () =>
    worker.queue("sync", [
      { id: "runtime", timestamp: new Date(), attempts: 1, body: { type: "notion.post", postId } },
    ]);
  const result = await deliver();
  assert.deepEqual(result.retryMessages, [], "real Worker queue must mirror without backoff");
  assert.deepEqual(result.explicitAcks, ["runtime"]);
  assert.deepEqual(
    await db.prepare("SELECT notion_page_id,notion_revision,revision FROM posts").first(),
    { notion_page_id: pageId, notion_revision: 1, revision: 1 },
  );
  assert.equal(calls.length, 2, "query then create must reach outbound runtime service");
  redirect = true;
  calls.length = 0;
  await db.prepare("UPDATE posts SET revision = 2").run();
  await deliver();
  assert.equal(calls.length, 1, "reject redirect without contacting its destination");
  assert.equal((await db.prepare("SELECT notion_revision FROM posts").first())?.notion_revision, 1);
  assert.equal(
    (await db.prepare("SELECT key FROM sync_state WHERE key = 'notion.error'").first())?.key,
    "notion.error",
  );
  console.log(
    "ok: emitted Worker queue mirrors in workerd and rejects redirects without following",
  );
} finally {
  await runtime.dispose();
}
