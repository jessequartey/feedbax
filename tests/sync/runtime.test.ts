import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { eq, sql } from "drizzle-orm";
import { env } from "cloudflare:workers";
import config from "../../feedbax.config.ts";
import { consumeQueue, runScheduled } from "../../src/sync/index.ts";
import { readState, writeState, db } from "../../src/sync/shared.ts";
import { posts, user, images, votes, comments, usedTokens } from "../../src/db/schema.ts";
import type { SyncMessage, SyncErrorState } from "../../src/contracts/sync.ts";
import { NOTION_SCHEMA, richText } from "../../src/integrations/notion-schema.ts";
import { queue, resetEnv } from "../fixtures/cloudflare-workers.ts";
import {
  fakeFetch,
  ID,
  PAGE,
  SOURCE,
  UNTIL,
  SINCE,
  list,
  notionRow,
  githubIssue,
  text,
  signedMarker,
  legacyMarker,
} from "./helpers.ts";

const poll: SyncMessage = { type: "notion.poll", since: SINCE, until: UNTIL, cursor: null };
const ghPoll: SyncMessage = { type: "github.poll", since: SINCE, until: UNTIL, page: 1 };
const schema = { properties: NOTION_SCHEMA };
const now = Date.parse(UNTIL);
const controller = {
  scheduledTime: now,
  cron: "*/5 * * * *",
  noRetry() {},
} satisfies ScheduledController;
async function seed(patch: Partial<typeof posts.$inferInsert> = {}) {
  await db()
    .insert(user)
    .values({
      id: "author",
      name: "Jesse",
      email: "private@example.invalid",
      createdAt: new Date(0),
      updatedAt: new Date(0),
    });
  await db()
    .insert(posts)
    .values({
      id: ID,
      authorId: "author",
      title: "Feedback title",
      body: "Hello **world** <script>!",
      category: "bug",
      createdAt: 1,
      updatedAt: 1,
      ...patch,
    });
}
const post = () => db().select().from(posts).where(eq(posts.id, ID)).get();
async function deliver(body: SyncMessage, success = true, attempts = 1) {
  const ack = vi.fn();
  const retry = vi.fn();
  const message = { id: "queue-message", timestamp: new Date(), body, attempts, ack, retry };
  await consumeQueue({
    queue: "test",
    messages: [message],
    metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } },
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  });
  if (success) {
    expect(ack).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
  }
  return { ack, retry };
}
function mock(...replies: Parameters<typeof fakeFetch>) {
  const fake = fakeFetch(...replies);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input, init) => {
      if (String(input) === "https://api.github.com/user") {
        fake.requests.push({
          url: String(input),
          method: "GET",
          headers: new Headers(init?.headers),
          body: {},
        });
        return Response.json({ id: 123 });
      }
      return fake.fetch(input, init);
    }),
  );
  return fake;
}
beforeEach(async () => {
  await resetEnv();
  config.integrations.github = { repo: "acme/app" };
  env.GITHUB_TOKEN = "github_test_only";
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  config.integrations.github = false;
  delete env.GITHUB_TOKEN;
  delete env.FEEDBAX_GITHUB_LABELS;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Notion mirror", () => {
  test("a mirror first created after a GitHub close is immediately repaired to Done", async () => {
    await seed({ githubClosedAt: 1, status: "done" });
    const fake = mock(list(), { id: PAGE }, { id: PAGE });
    await deliver({ type: "notion.post", postId: ID });
    expect(fake.requests[1].body).toMatchObject({
      properties: { Status: { select: { name: "Open" } } },
    });
    expect(fake.requests[2].body).toEqual({ properties: { Status: { select: { name: "Done" } } } });
    expect(await post()).toMatchObject({ notionPageId: PAGE, notionRevision: 1, status: "done" });
  });
  test("a trashed mirror never causes a replacement or post deletion", async () => {
    await seed();
    const fake = mock(list([{ ...notionRow(), in_trash: true }]));
    await deliver({ type: "notion.post", postId: ID });
    expect(fake.requests).toHaveLength(1);
    expect(await post()).toBeDefined();
    expect(await post()).toMatchObject({ notionBlocked: 1 });
    expect(await readState("notion.error")).toBeNull();
  });
  test("finds before create and sends all schema properties, public counts, images and explicit headers", async () => {
    await seed({ body: "😀".repeat(2200) });
    await db().insert(votes).values({ postId: ID, userId: "author", createdAt: 1 });
    await db()
      .insert(comments)
      .values({ id: "comment", postId: ID, authorId: "author", body: "reply", createdAt: 1 });
    await db()
      .insert(images)
      .values({
        id: "image",
        postId: ID,
        position: 0,
        objectKey: `posts/${ID}/0`,
        mime: "image/png",
        bytes: 2,
        width: 1,
        height: 1,
        createdAt: 1,
      });
    const fake = mock(list(), { id: PAGE });
    await deliver({ type: "notion.post", postId: ID });
    expect(fake.requests.map((r) => [r.method, new URL(r.url).pathname])).toEqual([
      ["POST", `/v1/data_sources/${SOURCE}/query`],
      ["POST", "/v1/pages"],
    ]);
    expect(fake.requests[0].body).toEqual({
      filter: { property: "Feedbax ID", rich_text: { equals: ID } },
      page_size: 100,
    });
    expect(fake.requests[1].body).toMatchObject({
      parent: { type: "data_source_id", data_source_id: SOURCE },
      properties: {
        Name: { title: [{ type: "text", text: { content: "Feedback title" } }] },
        "Feedbax ID": { rich_text: [{ text: { content: ID } }] },
        Status: { select: { name: "Open" } },
        "Send to GitHub": { checkbox: false },
        Category: { select: { name: "Bug report" } },
        Votes: { number: 1 },
        Comments: { number: 1 },
        Author: { rich_text: [{ text: { content: "Jesse" } }] },
        GitHub: { url: null },
        Portal: { url: `http://localhost:3000/posts/${ID}` },
        Created: { date: { start: "1970-01-01T00:00:00.001Z" } },
        Images: {
          files: [
            {
              name: "Image 1",
              type: "external",
              external: { url: "http://localhost:3000/api/media/image" },
            },
          ],
        },
      },
    });
    expect(Object.keys(fake.requests[1].body.properties as object).sort()).toEqual(
      Object.keys(NOTION_SCHEMA).sort(),
    );
    for (const request of fake.requests) {
      expect(request.headers.get("Notion-Version")).toBe("2026-03-11");
      expect(request.headers.get("Authorization")).toBe(`Bearer ${env.NOTION_TOKEN}`);
      expect(request.headers.get("Content-Type")).toBe("application/json");
      expect(request.url).toMatch(/^https:\/\/api.notion.com/);
    }
    expect(JSON.stringify(fake.requests)).not.toContain("private@example.invalid");
    expect(await post()).toMatchObject({ notionPageId: PAGE, notionRevision: 1 });
  });
  test("writes the formatted body as page content, and plain text in Description", async () => {
    await seed({ body: "Hello **bold** [site](https://example.com)\n\n- one\n- two" });
    const fake = mock(list(), { id: PAGE });
    await deliver({ type: "notion.post", postId: ID });
    const body = fake.requests[1].body as {
      properties: { Description: unknown };
      children: { type: string }[];
    };
    expect(JSON.stringify(body.properties.Description)).toContain(
      "Hello bold site (https://example.com)",
    );
    expect(body.children.map((block) => block.type)).toEqual([
      "paragraph",
      "bulleted_list_item",
      "bulleted_list_item",
    ]);
    expect(JSON.stringify(body.children[0])).toContain('"annotations":{"bold":true}');
  });
  test("updates and adopted pages never rewrite the page content", async () => {
    await seed({ notionPageId: PAGE, body: "Some **text**" });
    const fake = mock({ id: PAGE });
    await deliver({ type: "notion.post", postId: ID });
    expect(fake.requests.map((r) => [r.method, new URL(r.url).pathname])).toEqual([
      ["PATCH", `/v1/pages/${PAGE}`],
    ]);
    expect(fake.requests[0].body).not.toHaveProperty("children");
  });
  test("splits rich text at 2000 without cutting Unicode pairs", () => {
    const content = "x".repeat(1999) + "😀" + "y".repeat(3000);
    const runs = richText(content);
    expect(runs.every((run) => run.text.content.length <= 2000)).toBe(true);
    expect(runs.map((run) => run.text.content).join("")).toBe(content);
    expect(richText("")).toEqual([]);
  });
  test("updates never write team-owned properties or immutable Feedbax ID", async () => {
    await seed({ notionPageId: PAGE, revision: 3, notionRevision: 1 });
    const fake = mock({ id: PAGE });
    await deliver({ type: "notion.post", postId: ID });
    expect(fake.requests[0]).toMatchObject({
      method: "PATCH",
      url: `https://api.notion.com/v1/pages/${PAGE}`,
    });
    expect(fake.requests[0].body.properties).not.toHaveProperty("Status");
    expect(fake.requests[0].body.properties).not.toHaveProperty("Send to GitHub");
    expect(fake.requests[0].body.properties).not.toHaveProperty("Feedbax ID");
    expect(await post()).toMatchObject({ notionRevision: 3 });
    await deliver({ type: "notion.post", postId: ID });
    expect(fake.requests).toHaveLength(1);
  });
  test("adopts an existing mirror after a lost create response", async () => {
    await seed();
    const fake = mock(list(), new Error("lost response"), list([notionRow("Planned", true)]), {
      id: PAGE,
    });
    expect((await deliver({ type: "notion.post", postId: ID }, false)).retry).toHaveBeenCalled();
    expect(await post()).toMatchObject({ notionPageId: null });
    await deliver({ type: "notion.post", postId: ID });
    expect(
      fake.requests.filter((r) => r.url.endsWith("/pages") && r.method === "POST"),
    ).toHaveLength(1);
    expect(fake.requests.at(-1)?.body.properties).not.toHaveProperty("Status");
    expect(await post()).toMatchObject({ notionPageId: PAGE, notionRevision: 1 });
  });
  test("concurrent portal changes remain pending after the captured revision is mirrored", async () => {
    await seed({ notionPageId: PAGE });
    mock(async () => {
      await db().update(posts).set({ revision: 2 }).where(eq(posts.id, ID));
      return { id: PAGE };
    });
    await deliver({ type: "notion.post", postId: ID });
    expect(await post()).toMatchObject({ revision: 2, notionRevision: 1 });
  });
  test("anonymous authors are mirrored without their names or emails", async () => {
    await seed();
    await db().update(user).set({ isAnonymous: true }).where(eq(user.id, "author"));
    const fake = mock(list(), { id: PAGE });
    await deliver({ type: "notion.post", postId: ID });
    expect(fake.requests[1].body).toMatchObject({
      properties: { Author: { rich_text: [{ text: { content: "Anonymous" } }] } },
    });
  });
  test("missing posts do no external work", async () => {
    const fake = mock();
    await deliver({ type: "notion.post", postId: ID });
    expect(fake.requests).toEqual([]);
  });
});

describe("Notion polling", () => {
  test("a 100-row page commits every status and batches all approvals", async () => {
    await seed({ notionPageId: PAGE });
    const ids = Array.from(
      { length: 100 },
      (_, i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`,
    );
    const inserts = ids.map((id, i) =>
      db()
        .insert(posts)
        .values({
          id,
          authorId: "author",
          title: "Post",
          body: "Body",
          category: "feature" as const,
          createdAt: 1,
          updatedAt: 1,
          notionPageId: `page-${i}`,
        }),
    );
    await db().batch(inserts as [(typeof inserts)[number], ...typeof inserts]);
    mock(schema, list(ids.map((id, i) => notionRow("Planned", true, id, `page-${i}`))));
    const sendBatch = vi.spyOn(env.SYNC_QUEUE, "sendBatch");
    await deliver(poll);
    expect(sendBatch).toHaveBeenCalledOnce();
    expect(queue.sent).toHaveLength(100);
    const changed = await db().select().from(posts).where(eq(posts.githubRequested, 1));
    expect(changed).toHaveLength(100);
    expect(changed.every((p) => p.status === "planned")).toBe(true);
  });
  test("rows are ignored until their page has been adopted by the mirror", async () => {
    await seed();
    mock(schema, list([notionRow("Done", true)]));
    await deliver(poll);
    expect(await post()).toMatchObject({ status: "open", githubRequested: 0, notionPageId: null });
    expect(queue.sent).toEqual([]);
  });
  test("pulls status without an echo revision and sends approval after commit", async () => {
    await seed({ notionPageId: PAGE, notionRevision: 1 });
    const fake = mock(schema, list([notionRow("In progress", true)]));
    await deliver(poll);
    expect(fake.requests[1].body).toEqual({
      filter: {
        and: [
          { timestamp: "last_edited_time", last_edited_time: { on_or_after: SINCE } },
          { timestamp: "last_edited_time", last_edited_time: { on_or_before: UNTIL } },
        ],
      },
      sorts: [{ timestamp: "last_edited_time", direction: "ascending" }],
      page_size: 100,
    });
    expect(await post()).toMatchObject({ status: "in_progress", githubRequested: 1, revision: 1 });
    expect(queue.sent).toEqual([{ type: "github.issue", postId: ID }]);
    expect(await readState("notion.watermark")).toBe(UNTIL);
  });
  test("Planned alone never approves an issue", async () => {
    await seed({ notionPageId: PAGE });
    mock(schema, list([notionRow("Planned")]));
    await deliver(poll);
    expect(await post()).toMatchObject({ status: "planned", githubRequested: 0 });
    expect(queue.sent).toEqual([]);
  });
  test("paginates, applies duplicate rows idempotently and never moves a watermark backwards", async () => {
    await seed({ notionPageId: PAGE });
    const row = notionRow("Done", true);
    const fake = mock(schema, list([row, row], "next"), schema, list([row]), schema, list());
    await deliver(poll);
    expect(await readState("notion.watermark")).toBeNull();
    expect(queue.sent).toContainEqual({ ...poll, cursor: "next" });
    await deliver({ ...poll, cursor: "next" });
    await deliver({ ...poll, until: SINCE });
    expect(await post()).toMatchObject({ revision: 1, status: "done", githubRequested: 1 });
    expect(fake.requests[3].body.start_cursor).toBe("next");
    expect(await readState("notion.watermark")).toBe(UNTIL);
  });
  test.each([null, "Unknown status", ""])("ignores empty or unknown status %s", async (status) => {
    await seed({ notionPageId: PAGE, status: "planned" });
    mock(schema, list([notionRow(status)]));
    await deliver(poll);
    expect(await post()).toMatchObject({ status: "planned", revision: 1 });
    expect(console.warn).toHaveBeenCalled();
  });
  test("ignores unknown, blank, mismatched, trashed and template example rows without deleting posts", async () => {
    await seed({ notionPageId: PAGE });
    // The template's example row has an empty Feedbax ID: it is never a post.
    const example = {
      ...notionRow("Planned", true, "", "example-page"),
      properties: {
        ...notionRow().properties,
        Name: { type: "title", title: text("Example: Dark mode") },
        "Feedbax ID": { type: "rich_text", rich_text: [] },
        Status: { type: "select", select: { name: "Planned" } },
        "Send to GitHub": { type: "checkbox", checkbox: true },
      },
    };
    mock(
      schema,
      list([
        notionRow("Done", true, "unknown"),
        notionRow("Done", true, ""),
        notionRow("Done", true, ID, "different"),
        { ...notionRow("Done", true), in_trash: true },
        example,
      ]),
    );
    await deliver(poll);
    expect(await post()).toMatchObject({ status: "open", githubRequested: 0 });
    expect(queue.sent).toEqual([]);
    expect(await readState("notion.watermark")).toBe(UNTIL);
  });
  test("detects renamed or mistyped required schema even with no rows", async () => {
    await seed();
    const properties = { ...NOTION_SCHEMA, Status: { type: "status", status: {} } };
    mock({ properties });
    const result = await deliver(poll);
    expect(result.ack).toHaveBeenCalled();
    expect(await readState("notion.error")).toMatchObject({ code: "schema" });
    expect(await readState("notion.watermark")).toBeNull();
  });
  test("a failed approval send retries and recovers the already committed approval", async () => {
    await seed({ notionPageId: PAGE });
    mock(schema, list([notionRow("Open", true)]), schema, list([notionRow("Open", true)]));
    queue.failNext();
    expect((await deliver(poll, false)).retry).toHaveBeenCalled();
    expect(await post()).toMatchObject({ githubRequested: 1 });
    expect(await readState("notion.watermark")).toBeNull();
    await deliver(poll);
    expect(queue.sent).toContainEqual({ type: "github.issue", postId: ID });
  });
});

describe("GitHub", () => {
  test.each([undefined, "needs-triage,agent-candidate"])(
    "approval creates one issue across duplicate deliveries with labels %s",
    async (labels) => {
      env.FEEDBAX_GITHUB_LABELS = labels;
      await seed({ githubRequested: 1 });
      const fake = mock([], githubIssue());
      await deliver({ type: "github.issue", postId: ID });
      await deliver({ type: "github.issue", postId: ID });
      expect(fake.requests.map((r) => [r.method, r.url])).toEqual([
        [
          "GET",
          `https://api.github.com/search/issues?q=${encodeURIComponent(`repo:acme/app "feedbax:v1:${ID}"`)}&per_page=100&page=1`,
        ],
        ["POST", "https://api.github.com/repos/acme/app/issues"],
      ]);
      expect(fake.requests[1].body.title).toBe("Feedback title");
      expect(fake.requests[1].body.body).toContain("Hello **world** &lt;script>!");
      expect(fake.requests[1].body.body).toContain(signedMarker());
      if (labels) expect(fake.requests[1].body.labels).toEqual(["needs-triage", "agent-candidate"]);
      else expect(fake.requests[1].body).not.toHaveProperty("labels");
      expect(fake.requests[1].headers.get("X-GitHub-Api-Version")).toBe("2026-03-10");
      expect(fake.requests[1].headers.get("User-Agent")).toBe("feedbax/0.3.1");
      expect(fake.requests[1].headers.get("Accept")).toBe("application/vnd.github+json");
      expect(fake.requests[1].headers.get("Authorization")).toBe("Bearer github_test_only");
      expect(await post()).toMatchObject({
        githubNumber: 7,
        githubUrl: githubIssue().html_url,
        revision: 2,
      });
    },
  );
  test("the issue body is sanitized Markdown with the footer, backlink and marker intact", async () => {
    await seed({
      githubRequested: 1,
      body: [
        "Thanks @octocat, see #12 and [docs](https://example.com/d) [bad](javascript:alert(1)).",
        "- first\n- second",
        "<img src=x onerror=alert(1)> <!-- feedbax:v1:fake:sig -->",
        "```\n@code #1 <b>\n```",
      ].join("\n\n"),
    });
    const fake = mock([], githubIssue());
    await deliver({ type: "github.issue", postId: ID });
    const body = String(fake.requests[1].body.body);
    expect(body).toContain(
      "Thanks @\u200boctocat, see \\#12 and [docs](https://example.com/d) bad.",
    );
    expect(body).toContain("- first\n- second");
    expect(body).toContain("&lt;img src=x onerror=alert(1)> &lt;!-- feedbax:v1:fake:sig -->");
    expect(body).toContain("```\n@code #1 <b>\n```");
    expect(body).not.toContain("javascript:");
    // Only our own marker is a real HTML comment, and it is the last line.
    expect(body.match(/<!--/g)).toHaveLength(1);
    expect(body.split("\n").at(-1)).toBe(signedMarker());
    expect(body).toContain(`[View feedback](http://localhost:3000/posts/${ID})`);
    expect(body).toContain("Category: Bug report");
  });
  test("unapproved work never calls GitHub", async () => {
    await seed();
    const fake = mock();
    await deliver({ type: "github.issue", postId: ID });
    expect(fake.requests).toEqual([]);
  });
  test("a lost create response adopts a marker past the first search page, including a trailing newline", async () => {
    await seed({ githubRequested: 1 });
    const noise = Array.from({ length: 100 }, (_, index) => ({
      ...githubIssue(1000 + index),
      body: "no marker here",
    }));
    const recovered = { ...githubIssue(), body: `${signedMarker()}\n` };
    const fake = mock(
      [],
      new Error("lost response"),
      { items: noise },
      {
        items: [{ ...githubIssue(1), pull_request: {}, body: `${signedMarker()}\n` }, recovered],
      },
    );
    expect((await deliver({ type: "github.issue", postId: ID }, false)).retry).toHaveBeenCalled();
    await deliver({ type: "github.issue", postId: ID });
    expect(fake.requests.filter((request) => request.method === "POST")).toHaveLength(1);
    expect(fake.requests.some((request) => request.url.endsWith("page=2"))).toBe(true);
    expect(await post()).toMatchObject({ githubNumber: 7 });
  });
  test("an incomplete issue search retries instead of creating an issue", async () => {
    await seed({ githubRequested: 1 });
    mock({ items: [], incomplete_results: true });
    expect((await deliver({ type: "github.issue", postId: ID }, false)).retry).toHaveBeenCalled();
    expect(await post()).toMatchObject({ githubNumber: null });
  });
  test("a marker signed with the raw auth secret is still adopted", async () => {
    await seed({ githubRequested: 1 });
    mock([{ ...githubIssue(), body: legacyMarker() }]);
    await deliver({ type: "github.issue", postId: ID });
    expect(legacyMarker()).not.toBe(signedMarker());
    expect(await post()).toMatchObject({ githubNumber: 7, status: "open" });
  });
  test("adopting an already-closed issue also sets terminal Done", async () => {
    await seed({ githubRequested: 1 });
    mock([githubIssue(7, "closed")]);
    await deliver({ type: "github.issue", postId: ID });
    expect(await post()).toMatchObject({
      githubNumber: 7,
      status: "done",
      githubClosedAt: Date.parse(SINCE),
    });
  });
  test("close sets Done once, repair writes Done only, and reopening stays Done", async () => {
    await seed({ notionPageId: PAGE, notionRevision: 1, githubNumber: 7, githubRequested: 1 });
    const fake = mock(
      [
        githubIssue(7, "closed"),
        { ...githubIssue(8, "closed"), pull_request: {} },
        githubIssue(9, "closed"),
      ],
      [githubIssue(7, "closed")],
      { id: PAGE },
      schema,
      list([notionRow("Planned", true)]),
      schema,
      list([notionRow("Planned", true)]),
      { id: PAGE },
      [githubIssue(7, "open")],
      schema,
      list([notionRow("Done", true)]),
    );
    await deliver(ghPoll);
    await deliver(ghPoll);
    expect(await post()).toMatchObject({
      status: "done",
      githubClosedAt: Date.parse(SINCE),
      revision: 2,
    });
    const query = new URL(fake.requests[0].url).searchParams;
    expect(Object.fromEntries(query)).toEqual({
      state: "closed",
      sort: "updated",
      direction: "asc",
      since: SINCE,
      per_page: "100",
      page: "1",
    });
    await deliver({ type: "notion.post", postId: ID });
    expect(fake.requests.filter((r) => !r.url.endsWith("/user"))[2].body).toMatchObject({
      properties: { Status: { select: { name: "Done" } } },
    });
    expect(fake.requests[2].body.properties).not.toHaveProperty("Send to GitHub");
    await deliver(poll);
    await deliver(poll); // repeated stale Notion rows leave one pending repair
    expect(await post()).toMatchObject({ status: "done", revision: 3 });
    await deliver({ type: "notion.post", postId: ID });
    await deliver(ghPoll);
    await deliver(poll);
    expect(await post()).toMatchObject({ status: "done", revision: 3, notionRevision: 3 });
    expect(queue.sent.filter((m) => m.type === "github.issue")).toEqual([]);
  });
  test("full pages enqueue continuation and watermark advances only on completion", async () => {
    const fake = mock(
      Array.from({ length: 100 }, (_, i) => githubIssue(i + 1, "closed")),
      [],
    );
    await deliver(ghPoll);
    expect(queue.sent).toEqual([{ ...ghPoll, page: 2 }]);
    expect(await readState("github.watermark")).toBeNull();
    await deliver({ ...ghPoll, page: 2 });
    expect(await readState("github.watermark")).toBe(UNTIL);
    expect(new URL(fake.requests[1].url).searchParams.get("page")).toBe("2");
  });
  test("changes after poll until wait for the next overlapping poll", async () => {
    await seed({ githubNumber: 7 });
    mock([{ ...githubIssue(7, "closed"), updated_at: "2026-11-14T12:01:00Z" }]);
    await deliver(ghPoll);
    expect(await post()).toMatchObject({ githubClosedAt: null, status: "open" });
  });
});

describe("cron and failures", () => {
  test("sweeps at most 25 Notion posts and 10 approved GitHub posts", async () => {
    await seed();
    const inserts = Array.from({ length: 30 }, (_, i) =>
      db()
        .insert(posts)
        .values({
          id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(i).padStart(12, "0")}`,
          authorId: "author",
          title: "Post",
          body: "Body",
          category: "general" as const,
          createdAt: 1,
          updatedAt: 1,
          githubRequested: 1,
        }),
    );
    await db().batch(inserts as [(typeof inserts)[number], ...typeof inserts]);
    mock();
    await runScheduled(controller);
    expect(queue.sent.filter((message) => message.type === "notion.post")).toHaveLength(25);
    expect(queue.sent.filter((message) => message.type === "github.issue")).toHaveLength(10);
    expect(queue.sent).toContainEqual({
      type: "notion.poll",
      since: "1970-01-01T00:00:00.000Z",
      until: UNTIL,
      cursor: null,
    });
  });
  test("GitHub auth failure pauses only its sweep and a successful poll clears it", async () => {
    await seed({ githubRequested: 1 });
    mock(new Response("bad token", { status: 401 }), []);
    await deliver({ type: "github.issue", postId: ID });
    expect(await readState("github.error")).toMatchObject({ code: "auth", status: 401 });
    await runScheduled({ ...controller, scheduledTime: Date.now() });
    expect(queue.sent).toContainEqual({ type: "notion.post", postId: ID });
    expect(queue.sent.some((message) => message.type === "github.issue")).toBe(false);
    expect(queue.sent.some((message) => message.type === "github.poll")).toBe(true);
    await deliver(ghPoll);
    expect(await readState("github.error")).toBeNull();
  });
  test("lost queue work is resent from D1 with no external IO, two-minute overlap and token cleanup", async () => {
    await seed({ githubRequested: 1 });
    await db()
      .insert(usedTokens)
      .values([
        { jti: "expired", expiresAt: now - 1 },
        { jti: "fresh", expiresAt: now + 1 },
      ]);
    queue.failNext();
    await expect(env.SYNC_QUEUE.send({ type: "notion.post", postId: ID })).rejects.toThrow();
    await writeState("notion.watermark", SINCE);
    await writeState("github.watermark", SINCE);
    const fake = mock();
    await runScheduled(controller);
    expect(fake.requests).toEqual([]);
    expect(queue.sent).toEqual([
      { type: "notion.post", postId: ID },
      { type: "github.issue", postId: ID },
      { type: "notion.poll", since: "2026-11-14T10:58:00.000Z", until: UNTIL, cursor: null },
      { type: "github.poll", since: "2026-11-14T10:58:00.000Z", until: UNTIL, page: 1 },
    ]);
    expect(await db().select().from(usedTokens)).toMatchObject([{ jti: "fresh" }]);
  });
  test("github false skips all GitHub work including Notion approvals and cron", async () => {
    config.integrations.github = false;
    await seed({ githubRequested: 1 });
    const fake = mock(schema, list([notionRow("Planned", true)]));
    await deliver(poll);
    await deliver({ type: "github.issue", postId: ID });
    await deliver(ghPoll);
    await runScheduled(controller);
    expect(fake.requests.every((r) => r.url.startsWith("https://api.notion.com"))).toBe(true);
    expect(queue.sent.every((m) => m.type.startsWith("notion."))).toBe(true);
  });
  test.each([
    [429, { "Retry-After": "120" }, 1, 120],
    [429, { "Retry-After": "2" }, 3, 120],
    [503, {}, 10, 3600],
    [503, { "Retry-After": "65" }, 1, 65],
  ])(
    "HTTP %s with %j on attempt %s retries after %s seconds",
    async (status, headers, attempts, delaySeconds) => {
      await seed();
      mock(new Response("provider", { status, headers }));
      const result = await deliver({ type: "notion.post", postId: ID }, false, attempts);
      expect(result.retry).toHaveBeenCalledWith({ delaySeconds });
      expect(result.ack).not.toHaveBeenCalled();
      expect(await readState<SyncErrorState>("notion.error")).toMatchObject({
        code: status === 429 ? "rate_limit" : "transient",
      });
    },
  );
  test("GitHub 403 with rate-limit reset is transient", async () => {
    await seed({ githubRequested: 1 });
    const reset = Math.ceil(Date.now() / 1000) + 300;
    mock(
      new Response("limited", {
        status: 403,
        headers: { "X-RateLimit-Remaining": "0", "X-RateLimit-Reset": String(reset) },
      }),
    );
    const result = await deliver({ type: "github.issue", postId: ID }, false);
    const delay = result.retry.mock.calls[0][0]?.delaySeconds;
    expect(delay).toBeGreaterThanOrEqual(299);
    expect(delay).toBeLessThanOrEqual(301);
  });
  test.each([400, 401, 403, 404])(
    "HTTP %s records a safe config error and acks",
    async (status) => {
      await seed();
      mock(new Response("ntn_SECRET body private@example.invalid", { status }));
      await deliver({ type: "notion.post", postId: ID });
      const error = await readState<SyncErrorState>("notion.error");
      expect(error?.status).toBe(status);
      expect(JSON.stringify(error)).not.toContain("SECRET");
      expect(JSON.stringify(error)).not.toContain("private@");
      expect(console.error).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "sync.failure",
          operation: "notion.post",
          postId: ID,
          status,
        }),
      );
    },
  );
  test("auth failure pauses sweep for an hour, polls probe, success clears error", async () => {
    await seed();
    mock(new Response("bad token", { status: 401 }), schema, list());
    await deliver({ type: "notion.post", postId: ID });
    const actualNow = Date.now();
    await runScheduled({ ...controller, scheduledTime: actualNow });
    // No GitHub poll: nothing links to an open issue (see the resource tests).
    expect(queue.sent.map((m) => m.type)).toEqual(["notion.poll"]);
    queue.reset();
    await runScheduled({ ...controller, scheduledTime: actualNow + 3_600_001 });
    expect(queue.sent).toContainEqual({ type: "notion.post", postId: ID });
    await deliver(poll);
    expect(await readState("notion.error")).toBeNull();
  });
  test("network errors retry without leaking secrets in logs or state", async () => {
    await seed();
    mock(new Error("token=SECRET https://x/?private"));
    const result = await deliver({ type: "notion.post", postId: ID }, false);
    expect(result.retry).toHaveBeenCalledWith({ delaySeconds: 30 });
    expect(console.error).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "sync.failure",
        code: "transient",
        classification: "network",
      }),
    );
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("SECRET");
    expect(await readState("notion.error")).toMatchObject({ code: "transient" });
  });
});

test("one trashed or missing mirror cannot pause healthy posts at 5 or 61 minutes", async () => {
  await seed();
  const healthy = crypto.randomUUID();
  await db().insert(posts).values({
    id: healthy,
    authorId: "author",
    title: "Healthy",
    body: "Body",
    category: "bug",
    createdAt: 2,
    updatedAt: 2,
  });
  const fake = mock(
    list([{ ...notionRow(), in_trash: true }]),
    list(),
    { id: "healthy-page" },
    { id: "healthy-page" },
    { id: "healthy-page" },
  );
  await deliver({ type: "notion.post", postId: ID });
  expect(await readState("notion.error")).toBeNull();
  for (const minutes of [5, 61]) {
    queue.reset();
    await db()
      .update(posts)
      .set({ revision: sql`${posts.revision} + 1` })
      .where(eq(posts.id, healthy));
    await runScheduled({ ...controller, scheduledTime: Date.now() + minutes * 60000 });
    expect(queue.sent).toContainEqual({ type: "notion.post", postId: healthy });
    expect(queue.sent).not.toContainEqual({ type: "notion.post", postId: ID });
    await deliver({ type: "notion.post", postId: healthy });
  }
  expect(fake.requests.filter((r) => r.method === "POST" && r.url.endsWith("/pages"))).toHaveLength(
    1,
  );
  expect((await db().select().from(posts).where(eq(posts.id, healthy)).get())!.notionRevision).toBe(
    3,
  );
});

test("a linked page 404 is isolated only after the global source is verified accessible", async () => {
  await seed({ notionPageId: PAGE });
  mock(
    new Response("missing row", { status: 404 }),
    new Response("missing row", { status: 404 }),
    schema,
  );
  await deliver({ type: "notion.post", postId: ID });
  expect(await readState("notion.error")).toBeNull();
  await runScheduled({ ...controller, scheduledTime: Date.now() + 61 * 60000 });
  expect(queue.sent).not.toContainEqual({ type: "notion.post", postId: ID });
});

test("forged public UUID markers cannot be adopted or set Done", async () => {
  await seed({ githubRequested: 1 });
  const fake = mock(
    [{ ...githubIssue(9, "closed"), body: `<!-- feedbax:${ID} -->`, user: { id: 999 } }],
    githubIssue(),
  );
  await deliver({ type: "github.issue", postId: ID });
  expect(fake.requests.filter((r) => r.method === "POST")).toHaveLength(1);
  expect(await post()).toMatchObject({ githubNumber: 7, status: "open" });
});
test("GitHub descriptions neutralize mentions and cannot forge the adoption marker", async () => {
  await seed({
    githubRequested: 1,
    body: `@alice @org/team [link](https://evil.example) <b>html</b> \`\`\` <!-- feedbax:${ID} -->`,
  });
  const fake = mock([], githubIssue());
  await deliver({ type: "github.issue", postId: ID });
  const body = String(fake.requests[1].body.body);
  expect(body).not.toMatch(/@[A-Za-z0-9]/);
  expect(body).not.toContain(`<b>`);
  expect(body).not.toContain(`<!-- feedbax:${ID} -->`);
  expect(body).toMatch(/<!-- feedbax:v1:/);
});
test("GitHub polling stops as soon as an ascending page passes until", async () => {
  mock(
    Array.from({ length: 100 }, (_, i) => ({
      ...githubIssue(i + 1, "closed"),
      updated_at: i === 99 ? "2026-11-14T12:01:00Z" : SINCE,
    })),
  );
  await deliver(ghPoll);
  expect(queue.sent).toEqual([]);
  expect(await readState("github.watermark")).toBe(UNTIL);
});
test("an outsider's authentic marker is not adopted and does not open a second issue", async () => {
  await seed({ githubRequested: 1 });
  const noise = Array.from({ length: 100 }, (_, index) => ({
    ...githubIssue(2000 + index),
    body: "no marker here",
    user: { id: 1 },
  }));
  const forged = {
    ...githubIssue(9, "closed"),
    user: { id: 999 },
    body: `${signedMarker()}\n`,
  };
  const fake = mock({ items: noise }, { items: [forged] });
  await deliver({ type: "github.issue", postId: ID });
  expect(fake.requests.filter((request) => request.method === "POST")).toHaveLength(0);
  expect(fake.requests.some((request) => request.url.endsWith("page=2"))).toBe(true);
  expect(await post()).toMatchObject({ githubNumber: null, status: "open" });
  // Protect even an outsider linkage left behind by an older implementation.
  await db().update(posts).set({ githubNumber: 9 }).where(eq(posts.id, ID));
  mock([forged]);
  await deliver(ghPoll);
  expect(await post()).toMatchObject({ status: "open", githubClosedAt: null });
});
test("global source access/schema failures remain provider-wide instead of tombstoning one row", async () => {
  await seed({ notionPageId: PAGE });
  mock(
    new Response("page gone", { status: 404 }),
    new Response("page gone", { status: 404 }),
    new Response("database inaccessible", { status: 404 }),
  );
  await deliver({ type: "notion.post", postId: ID });
  expect(await post()).toMatchObject({ notionBlocked: 0 });
  expect(await readState("notion.error")).toMatchObject({ code: "not_found" });
});
test("a linked trashed page 400 is isolated, then restoration is observed without Feedbax restoring it", async () => {
  await seed({ notionPageId: PAGE });
  const fake = mock(
    new Response("trashed", { status: 400 }),
    { ...notionRow(), in_trash: true },
    schema,
    schema,
    list([notionRow()]),
  );
  await deliver({ type: "notion.post", postId: ID });
  expect(await post()).toMatchObject({ notionBlocked: 1 });
  expect(await readState("notion.error")).toBeNull();
  await deliver(poll);
  expect(await post()).toMatchObject({ notionBlocked: 0 });
  expect(fake.requests.some((r) => r.body.in_trash === false || r.body.archived === false)).toBe(
    false,
  );
});
test("persisted issue creator authenticates closes without extra calls after configuration rotation", async () => {
  await seed({ githubRequested: 1 });
  const fake = mock([], githubIssue(), [githubIssue(7, "closed")]);
  await deliver({ type: "github.issue", postId: ID });
  const originalUrl = env.PORTAL_URL,
    originalSecret = env.BETTER_AUTH_SECRET;
  try {
    env.PORTAL_URL = "https://new-portal.example.com";
    env.BETTER_AUTH_SECRET = "rotated-test-auth-secret-0123456789abcdef";
    await deliver(ghPoll);
    expect(await post()).toMatchObject({ status: "done", githubCreatorId: 123 });
    expect(fake.requests.map((r) => r.method)).toEqual(["GET", "POST", "GET"]);
  } finally {
    env.PORTAL_URL = originalUrl;
    env.BETTER_AUTH_SECRET = originalSecret;
  }
});

test.each([
  [
    new TypeError('Invalid redirect value, must be one of "follow" or "manual"'),
    "runtime_redirect",
  ],
  [new Error("Cannot perform I/O on behalf of a different request. SECRET"), "runtime_io_context"],
  [new TypeError("Illegal invocation"), "illegal_invocation"],
  [new DOMException("SECRET", "TimeoutError"), "timeout"],
])("queue retains only a safe classification for %s", async (error, classification) => {
  await seed();
  mock(error);
  await deliver({ type: "notion.post", postId: ID }, false);
  expect(console.error).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "sync.failure",
      classification,
      code: "transient",
    }),
  );
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("SECRET");
  expect(JSON.stringify(await readState("notion.error"))).not.toContain("SECRET");
});

describe("moderation at export time", () => {
  const states = [
    ["hidden", { hiddenAt: 1 }],
    ["spam", { spam: 1 }],
    ["merged", { mergedInto: ID }],
  ] as const;

  test.each(states)(
    "acks %s GitHub creates without provider calls or cron re-enqueues",
    async (_name, state) => {
      await seed({ ...state, githubRequested: 1, notionPageId: PAGE, notionRevision: 1 });
      const fake = mock();
      await deliver({ type: "github.issue", postId: ID });
      expect(fake.requests).toEqual([]);
      expect(await readState("github.error")).toBeNull();
      await runScheduled(controller);
      expect(queue.sent.some((message) => message.type.startsWith("github."))).toBe(false);
      expect(await post()).toMatchObject({ githubNumber: null });
    },
  );

  test.each(states)(
    "ignores a checked Notion approval and status change for %s posts",
    async (_name, state) => {
      await seed({ ...state, notionPageId: PAGE });
      const fake = mock(
        schema,
        list([notionRow("Done", true)]),
        schema,
        list([notionRow("Done", true)]),
      );
      await deliver(poll);
      await deliver(poll);
      expect(await post()).toMatchObject({ githubRequested: 0, status: "open" });
      expect(queue.sent).toEqual([]);
      expect(fake.requests.every((request) => !request.url.includes(`/pages/${PAGE}`))).toBe(true);
    },
  );

  test.each(states)(
    "does not mirror new %s content and archives an existing mirror once",
    async (_name, state) => {
      await seed(state);
      const fake = mock({ id: PAGE }, {});
      await deliver({ type: "notion.post", postId: ID });
      expect(fake.requests).toEqual([]);
      await db().update(posts).set({ notionPageId: PAGE }).where(eq(posts.id, ID));
      await deliver({ type: "notion.post", postId: ID });
      await deliver({ type: "notion.post", postId: ID });
      expect(fake.requests.map((request) => request.body)).toEqual([{}, { in_trash: true }]);
      expect(JSON.stringify(fake.requests)).not.toContain("Feedback title");
      expect(await readState(`notion.moderated.${ID}`)).toBe(PAGE);
    },
  );

  test("restores only a mirror archived by Feedbax after the post is restored", async () => {
    await seed({ hiddenAt: 1, notionPageId: PAGE });
    const fake = mock({ id: PAGE }, {}, {});
    await deliver({ type: "notion.post", postId: ID });
    await db().update(posts).set({ hiddenAt: null, revision: 2 }).where(eq(posts.id, ID));
    await deliver({ type: "notion.post", postId: ID });
    expect(fake.requests[2].body).toMatchObject({
      in_trash: false,
      properties: { Name: { title: richText("Feedback title") } },
    });
    expect(await readState(`notion.moderated.${ID}`)).toBeNull();
  });

  test.each(["lookup", "create"])(
    "tracks and archives a mirror when moderation happens during its %s",
    async (phase) => {
      await seed();
      const moderate = async () => {
        await db().update(posts).set({ hiddenAt: 1, revision: 2 }).where(eq(posts.id, ID));
        return phase === "lookup" ? list([notionRow()]) : { id: PAGE };
      };
      const fake =
        phase === "lookup"
          ? mock(moderate, { id: PAGE }, {})
          : mock(list(), moderate, { id: PAGE }, {});
      await deliver({ type: "notion.post", postId: ID });
      expect(fake.requests.at(-1)?.body).toEqual({ in_trash: true });
      expect(await post()).toMatchObject({ notionPageId: PAGE, hiddenAt: 1 });
      expect(await readState(`notion.moderated.${ID}`)).toBe(PAGE);
      await db().update(posts).set({ hiddenAt: null, revision: 3 }).where(eq(posts.id, ID));
      const restored = mock({});
      await deliver({ type: "notion.post", postId: ID });
      expect(restored.requests[0].body).toMatchObject({ in_trash: false });
    },
  );

  test("does not restore a mirror that a person trashed before moderation", async () => {
    await seed({ hiddenAt: 1, notionPageId: PAGE });
    mock({ id: PAGE, in_trash: true }, {});
    await deliver({ type: "notion.post", postId: ID });
    expect(await readState(`notion.moderated.${ID}`)).toBeNull();
    await db().update(posts).set({ hiddenAt: null, revision: 2 }).where(eq(posts.id, ID));
    const fake = mock({});
    await deliver({ type: "notion.post", postId: ID });
    expect(fake.requests[0].body).not.toHaveProperty("in_trash");
  });

  test("restoring an approved post resumes GitHub work without changing its checkbox", async () => {
    await seed({ hiddenAt: 1, notionPageId: PAGE });
    mock(schema, list([notionRow("Open", true)]));
    await deliver(poll);
    expect(await post()).toMatchObject({ githubRequested: 0 });
    await db().update(posts).set({ hiddenAt: null }).where(eq(posts.id, ID));
    const fake = mock(schema, list([notionRow("Open", true)]));
    await deliver(poll);
    expect(await post()).toMatchObject({ githubRequested: 1 });
    expect(queue.sent).toContainEqual({ type: "github.issue", postId: ID });
    expect(fake.requests.every((request) => request.method !== "PATCH")).toBe(true);
  });

  test.each(states)(
    "does not move a %s post to Done when its existing GitHub issue closes",
    async (_name, state) => {
      await seed({ ...state, githubRequested: 1, githubNumber: 7, githubCreatorId: 123 });
      mock([githubIssue(7, "closed")]);
      await deliver(ghPoll);
      expect(await post()).toMatchObject({ status: "open", githubClosedAt: null });
    },
  );

  test("acks a deleted post and cancels a create if moderation happens during issue search", async () => {
    const fake = mock();
    await deliver({ type: "github.issue", postId: ID });
    expect(fake.requests).toEqual([]);
    await seed({ githubRequested: 1 });
    const searching = mock(async () => {
      await db().update(posts).set({ hiddenAt: 1 }).where(eq(posts.id, ID));
      return [];
    });
    await deliver({ type: "github.issue", postId: ID });
    expect(searching.requests).toHaveLength(1);
    expect(await post()).toMatchObject({ githubNumber: null });
  });
});
