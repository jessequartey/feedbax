import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { eq, sql } from "drizzle-orm";
import { env } from "cloudflare:workers";
import config from "../../feedbax.config.ts";
import fixture from "../fixtures/github/release-published.json";
import { queue, resetEnv } from "../fixtures/cloudflare-workers.ts";
import { handleGitHubWebhook } from "../../src/server/github-webhook.ts";
import { saveSettings, readSettings } from "../../src/server/settings.ts";
import { db, readState } from "../../src/sync/shared.ts";
import { changelogEntries, changelogPosts, posts, user } from "../../src/db/schema.ts";
import {
  reconcileReleases,
  RELEASE_INTERVAL_MS,
  releaseIssueNumbers,
  syncRelease,
  type ReleaseState,
} from "../../src/sync/github-releases.ts";
import { changelogPublishedSinks } from "../../src/server/changelog-events.ts";
import {
  deleteEntry,
  listAdminEntries,
  listPublishedEntries,
  setChangelogStatus,
  updateEntry,
} from "../../src/server/changelog.ts";
import { markdownToHtml } from "../../src/lib/markdown.ts";
import { runScheduled, consumeQueue } from "../../src/sync/index.ts";
import { fakeFetch, ID } from "./helpers.ts";

const secret = "test-only-github-webhook-secret";
const originalGithub = config.integrations.github;
const originalToken = env.GITHUB_TOKEN;
const originalSecret = env.GITHUB_WEBHOOK_SECRET;
const publish = vi.fn();
const message = { repo: "acme/app", releaseId: fixture.release.id };
const entry = () => db().select().from(changelogEntries).get();
const now = Date.parse(fixture.release.published_at);
function request(payload: unknown = fixture, signature?: string) {
  const body = JSON.stringify(payload);
  return new Request("http://localhost:3000/api/webhooks/github", {
    method: "POST",
    body,
    headers: {
      "x-github-event": "release",
      "x-hub-signature-256":
        signature ?? `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`,
    },
  });
}
function mock(...replies: Parameters<typeof fakeFetch>) {
  const fake = fakeFetch(...replies);
  vi.stubGlobal("fetch", fake.fetch);
  return fake;
}
beforeEach(async () => {
  await resetEnv();
  publish.mockClear();
  changelogPublishedSinks.push(publish);
  config.integrations.github = { repo: "acme/app" };
  env.GITHUB_TOKEN = "github_test_only_fake";
  env.GITHUB_WEBHOOK_SECRET = secret;
  await saveSettings({ changelog: { source: "github" } });
});
afterEach(async () => {
  changelogPublishedSinks.splice(changelogPublishedSinks.indexOf(publish), 1);
  config.integrations.github = originalGithub;
  env.GITHUB_TOKEN = originalToken;
  env.GITHUB_WEBHOOK_SECRET = originalSecret;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await resetEnv();
});

it("verifies the exact signature and repository before enqueueing a fixture webhook", async () => {
  const fetch = mock();
  expect((await handleGitHubWebhook(request(fixture, `sha256=${"0".repeat(64)}`))).status).toBe(
    401,
  );
  expect(
    (await handleGitHubWebhook(request({ ...fixture, repository: { full_name: "other/repo" } })))
      .status,
  ).toBe(400);
  expect(queue.sent).toEqual([]);
  expect((await handleGitHubWebhook(request())).status).toBe(202);
  expect(queue.sent).toEqual([{ type: "github.release", ...message }]);
  expect(fetch.requests).toHaveLength(0);
  await saveSettings({ changelog: { source: "portal" } });
  expect((await handleGitHubWebhook(request())).status).toBe(204);
  expect(queue.sent).toHaveLength(1);
});

it("processes a signed fixture through the queue, updates edits, and emits only once", async () => {
  await handleGitHubWebhook(request());
  mock(fixture.release);
  const ack = vi.fn(),
    retry = vi.fn();
  await consumeQueue({
    messages: [{ body: queue.sent[0]!, ack, retry, attempts: 1 }],
  } as unknown as MessageBatch<import("../../src/contracts/sync.ts").SyncMessage>);
  expect(ack).toHaveBeenCalledOnce();
  expect(retry).not.toHaveBeenCalled();
  const first = (await entry())!;
  expect(first).toMatchObject({
    title: "Useful release",
    body: fixture.release.body,
    publishedAt: now,
    status: "published",
    githubReleaseId: 12345,
  });
  const html = markdownToHtml(first.body);
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain('href="javascript:');
  mock({ ...fixture.release, name: "Edited notes", body: "Updated **notes**" });
  await handleGitHubWebhook(request({ ...fixture, action: "edited" }));
  await syncRelease(message);
  expect(await entry()).toMatchObject({
    id: first.id,
    title: "Edited notes",
    body: "Updated **notes**",
  });
  expect(publish).toHaveBeenCalledOnce();
});

it.each(["deleted", "unpublished", "prereleased"])(
  "hides %s releases and never notifies on republication",
  async (action) => {
    mock(fixture.release);
    await syncRelease(message);
    expect((await handleGitHubWebhook(request({ ...fixture, action }))).status).toBe(202);
    mock(
      action === "deleted"
        ? new Response(null, { status: 404 })
        : {
            ...fixture.release,
            draft: action === "unpublished",
            prerelease: action === "prereleased",
          },
    );
    await syncRelease(message);
    expect((await listPublishedEntries({})).total).toBe(0);
    expect((await entry())!.githubNotifiedAt).not.toBeNull();
    mock(fixture.release);
    await syncRelease(message);
    expect((await listPublishedEntries({})).total).toBe(1);
    expect(publish).toHaveBeenCalledOnce();
  },
);

it("ignores new drafts and prereleases, falls back to the tag for an empty name", async () => {
  mock(
    { ...fixture.release, draft: true },
    { ...fixture.release, prerelease: true },
    { ...fixture.release, name: "" },
  );
  await syncRelease(message);
  await syncRelease(message);
  expect(await entry()).toBeUndefined();
  await syncRelease(message);
  expect((await entry())!.title).toBe("v1.2.3");
});

it("links matching issue references in one set, marks posts Done, and replaces links on edit", async () => {
  await db()
    .insert(user)
    .values({
      id: "author",
      name: "Ada",
      email: "ada@example.invalid",
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
  await db()
    .insert(posts)
    .values(
      [7, 8, 9, 10].map((number) => ({
        id: number === 7 ? ID : crypto.randomUUID(),
        authorId: "author",
        title: `Post ${number}`,
        body: "A post",
        category: "bug" as const,
        githubNumber: number,
        githubUrl: `https://github.com/acme/app/issues/${number}`,
        createdAt: 0,
        updatedAt: 0,
      })),
    );
  mock(fixture.release);
  await syncRelease(message);
  expect(await db().select().from(changelogPosts)).toHaveLength(3);
  const rows = await db().select().from(posts);
  expect(rows.filter((row) => row.status === "done")).toHaveLength(3);
  const page = await listPublishedEntries({});
  expect(page.items[0]!.posts).toHaveLength(3);
  mock({ ...fixture.release, body: "Closes #7" });
  await syncRelease(message);
  expect(await db().select().from(changelogPosts)).toEqual([
    { entryId: (await entry())!.id, postId: ID },
  ]);
});

it("handles same-repository references and rejects foreign ones", () => {
  expect(
    releaseIssueNumbers(
      "Closes #7 #7 acme/app#8 other/repo#9 https://github.com/other/repo/issues/10 https://github.com/acme/app/issues/11",
      "acme/app",
    ),
  ).toEqual([7, 8, 11]);
});

it("reconciles with ETag 304, throttles to 12 ticks and removes missing entries", async () => {
  const fetch = mock(
    Response.json([fixture.release], { headers: { etag: '"v1"' } }),
    new Response(null, { status: 304 }),
    Response.json([], { headers: { etag: '"v2"' } }),
  );
  await reconcileReleases(now);
  await reconcileReleases(now + 11 * 5 * 60 * 1000);
  expect(fetch.requests).toHaveLength(1);
  await reconcileReleases(now + RELEASE_INTERVAL_MS);
  expect(fetch.requests[1]!.headers.get("If-None-Match")).toBe('"v1"');
  expect((await entry())!.status).toBe("published");
  // Use a future scan time so the concurrent-webhook guard allows removing the entry.
  await reconcileReleases(Date.now() + RELEASE_INTERVAL_MS * 2);
  expect((await entry())!.status).toBe("draft");
  expect(publish).toHaveBeenCalledOnce();
});

it("paginates a complete scan before hiding entries and reuses cached pages on 304", async () => {
  mock(
    Response.json([fixture.release], {
      headers: { etag: '"p1"', link: '<https://api.github.com/x?page=2>; rel="next"' },
    }),
    Response.json([{ ...fixture.release, id: 999 }], { headers: { etag: '"p2"' } }),
    new Response(null, { status: 304 }),
    new Response(null, { status: 304 }),
  );
  const time = Date.now();
  await reconcileReleases(time);
  expect((await readState<ReleaseState>("github.releases"))!.page).toBe(2);
  await reconcileReleases(time + RELEASE_INTERVAL_MS);
  expect((await listPublishedEntries({})).total).toBe(2);
  await reconcileReleases(time + RELEASE_INTERVAL_MS * 2);
  await reconcileReleases(time + RELEASE_INTERVAL_MS * 3);
  expect((await listPublishedEntries({})).total).toBe(2);
});

it("only schedules release reconciliation while opted in and due", async () => {
  const controller = (time: number) => ({ scheduledTime: time, cron: "*/5 * * * *", noRetry() {} });
  const fetch = mock(Response.json([], { headers: { etag: '"empty"' } }));
  await runScheduled(controller(now));
  expect(queue.sent.filter((m) => m.type === "github.releases")).toHaveLength(1);
  expect(fetch.requests).toHaveLength(0);
  await reconcileReleases(now);
  queue.reset();
  await runScheduled(controller(now + 300_000));
  expect(queue.sent.filter((m) => m.type === "github.releases")).toHaveLength(0);
  await saveSettings({ changelog: { source: "portal" } });
  await runScheduled(controller(now + RELEASE_INTERVAL_MS));
  expect(queue.sent.filter((m) => m.type === "github.releases")).toHaveLength(0);
});

it("rejects portal edits, status changes and deletion of imported entries on the server", async () => {
  mock(fixture.release);
  await syncRelease(message);
  const id = (await entry())!.id;
  expect((await listAdminEntries({})).items[0]!.githubUrl).toBe(
    "https://github.com/acme/app/releases/tag/v1.2.3",
  );
  await expect(updateEntry({ id, title: "Changed", body: "No" })).rejects.toMatchObject({
    code: "forbidden",
  });
  await expect(setChangelogStatus({ id, published: false })).rejects.toMatchObject({
    code: "forbidden",
  });
  await expect(deleteEntry({ id })).rejects.toMatchObject({ code: "forbidden" });
  expect(
    (await db().select().from(changelogEntries).where(eq(changelogEntries.id, id)).get())!.title,
  ).toBe("Useful release");
});

it("defaults to Portal and refuses enabling without GitHub config/token", async () => {
  await saveSettings({ changelog: { source: null } });
  expect((await readSettings()).changelog.source).toBe("portal");
  env.GITHUB_TOKEN = undefined;
  await expect(saveSettings({ changelog: { source: "github" } })).rejects.toMatchObject({
    field: "changelog.source",
  });
  config.integrations.github = false;
  await expect(saveSettings({ changelog: { source: "github" } })).rejects.toMatchObject({
    field: "changelog.source",
  });
});

it("rejects malformed signed payloads without a server error", async () => {
  for (const payload of [
    null,
    [],
    { ...fixture, repository: { full_name: 123 } },
    { ...fixture, release: { id: "12345" } },
  ]) {
    expect((await handleGitHubWebhook(request(payload))).status).toBeLessThan(500);
  }
  expect(queue.sent).toEqual([]);
});

it("matches repository names literally and links large releases without unbounded SQL bindings", async () => {
  config.integrations.github = { repo: "acme/my_app" };
  await db()
    .insert(user)
    .values({
      id: "author",
      name: "Ada",
      email: "ada@example.invalid",
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
  const numbers = Array.from({ length: 120 }, (_, index) => index + 1);
  await db()
    .run(sql`INSERT INTO posts (id, author_id, title, body, category, github_number, github_url, created_at, updated_at)
    SELECT 'post-' || value, 'author', 'Post ' || value, 'A post', 'bug', value, 'https://github.com/acme/my_app/issues/' || value, 0, 0 FROM json_each(${JSON.stringify(numbers)})`);
  await db().insert(posts).values({
    id: "foreign",
    authorId: "author",
    title: "Foreign post",
    body: "A post",
    category: "bug",
    githubNumber: 121,
    githubUrl: "https://github.com/acme/my-app/issues/121",
    createdAt: 0,
    updatedAt: 0,
  });
  mock({
    ...fixture.release,
    body: [...numbers, 121].map((number) => `Closes #${number}`).join("\n"),
  });
  await syncRelease({ repo: "acme/my_app", releaseId: fixture.release.id });
  expect(await db().select().from(changelogPosts)).toHaveLength(120);
  expect((await db().select().from(posts).where(eq(posts.id, "foreign")).get())!.status).toBe(
    "open",
  );
  expect((await listPublishedEntries({})).items[0]!.posts).toHaveLength(120);
  expect(publish).toHaveBeenCalledOnce();
});

it("recovers a publication claim after a storage failure without notifying twice", async () => {
  mock(fixture.release, fixture.release, fixture.release);
  await syncRelease(message);
  // Simulate persistence succeeding before the notification claim could be written.
  await db().update(changelogEntries).set({ githubNotifiedAt: null });
  publish.mockClear();
  await syncRelease(message);
  await syncRelease(message);
  expect(publish).toHaveBeenCalledOnce();
});

it("claims publication once for concurrent duplicate deliveries", async () => {
  mock(fixture.release, fixture.release);
  await Promise.all([syncRelease(message), syncRelease(message)]);
  expect(await db().select().from(changelogEntries)).toHaveLength(1);
  expect(publish).toHaveBeenCalledOnce();
});
