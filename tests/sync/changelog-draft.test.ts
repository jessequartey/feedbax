import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import config from "../../feedbax.config.ts";
import { consumeQueue } from "../../src/sync/index.ts";
import { db } from "../../src/sync/shared.ts";
import { changelogEntries, changelogPosts, posts, user } from "../../src/db/schema.ts";
import type { SyncMessage } from "../../src/contracts/sync.ts";
import { NOTION_SCHEMA } from "../../src/integrations/notion-schema.ts";
import { saveSettings } from "../../src/server/settings.ts";
import { resetEnv } from "../fixtures/cloudflare-workers.ts";
import { fakeFetch, githubIssue, ID, list, notionRow, PAGE, SINCE, UNTIL } from "./helpers.ts";

// Ticket 06: a post that becomes Done gets one draft changelog entry, whichever way it got
// there (Notion status, GitHub close at link time, GitHub close poll), however often it is
// retried, and only when `changelog.autoDraft` is on.

const poll: SyncMessage = { type: "notion.poll", since: SINCE, until: UNTIL, cursor: null };
const ghPoll: SyncMessage = { type: "github.poll", since: SINCE, until: UNTIL, page: 1 };
const schema = { properties: NOTION_SCHEMA };

async function seed(patch: Partial<typeof posts.$inferInsert> = {}) {
  await db()
    .insert(user)
    .values({
      id: "author",
      name: "Jesse",
      email: "private@example.invalid",
      createdAt: new Date(0),
      updatedAt: new Date(0),
    })
    .onConflictDoNothing();
  await db()
    .insert(posts)
    .values({
      id: ID,
      authorId: "author",
      title: "Export to CSV",
      body: "Please let me   export\nmy data as CSV.",
      category: "feature",
      createdAt: 1,
      updatedAt: 1,
      notionPageId: PAGE,
      notionRevision: 1,
      ...patch,
    });
}
const entries = () => db().select().from(changelogEntries);
const links = () => db().select().from(changelogPosts);
const setStatus = (status: "open" | "done") =>
  db().update(posts).set({ status }).where(eq(posts.id, ID));
async function deliver(body: SyncMessage) {
  const ack = vi.fn();
  await consumeQueue({
    queue: "test",
    messages: [{ id: "m", timestamp: new Date(), body, attempts: 1, ack, retry: vi.fn() }],
    metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } },
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  });
  expect(ack).toHaveBeenCalledOnce();
}
function mock(...replies: Parameters<typeof fakeFetch>) {
  const fake = fakeFetch(...replies);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input, init) =>
      String(input) === "https://api.github.com/user"
        ? Response.json({ id: 123 })
        : fake.fetch(input, init),
    ),
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("auto-draft when a post becomes Done", () => {
  test("a Notion Done drafts one entry: title, excerpt body, linked post, not published", async () => {
    await seed();
    mock(schema, list([notionRow("Done")]));
    await deliver(poll);
    const [draft] = await entries();
    expect(await entries()).toHaveLength(1);
    expect(draft).toMatchObject({
      title: "Shipped: Export to CSV",
      body: "Please let me export my data as CSV.",
      status: "draft",
      publishedAt: null,
      authorId: null,
    });
    expect(await links()).toEqual([{ entryId: draft!.id, postId: ID }]);
  });

  test("the body is an excerpt, not the whole post", async () => {
    await seed({ body: "word ".repeat(200).trim() });
    mock(schema, list([notionRow("Done")]));
    await deliver(poll);
    const [draft] = await entries();
    expect(Array.from(draft!.body)).toHaveLength(281);
    expect(draft!.body.endsWith("…")).toBe(true);
  });

  test("repeated Done transitions and replayed polls never make a second draft", async () => {
    await seed();
    mock(schema, list([notionRow("Done")]), schema, list([notionRow("Done")]));
    await deliver(poll);
    await deliver(poll); // the same message again: a queue retry
    expect(await entries()).toHaveLength(1);

    // Reopened in Notion, then Done again: still the one draft.
    await setStatus("open");
    mock(schema, list([notionRow("Done")]));
    await deliver(poll);
    expect((await db().select().from(posts).where(eq(posts.id, ID)).get())!.status).toBe("done");
    expect(await entries()).toHaveLength(1);
    expect(await links()).toHaveLength(1);
  });

  test("a published or edited entry also counts: no second draft appears", async () => {
    await seed();
    mock(schema, list([notionRow("Done")]));
    await deliver(poll);
    const [draft] = await entries();
    await db()
      .update(changelogEntries)
      .set({ status: "published", publishedAt: 5, title: "v2.0" })
      .where(eq(changelogEntries.id, draft!.id));
    await setStatus("open");
    mock(schema, list([notionRow("Done")]));
    await deliver(poll);
    expect(await entries()).toHaveLength(1);
  });

  test("an entry an admin already linked to the post is enough", async () => {
    await seed();
    await db().insert(changelogEntries).values({
      id: "manual",
      title: "v1.0",
      body: "",
      status: "published",
      createdAt: 1,
      updatedAt: 1,
    });
    await db().insert(changelogPosts).values({ entryId: "manual", postId: ID });
    mock(schema, list([notionRow("Done")]));
    await deliver(poll);
    expect((await entries()).map((entry) => entry.id)).toEqual(["manual"]);
  });

  test("Notion Done then the GitHub close (and the reverse) still leave one draft", async () => {
    await seed({ githubNumber: 7, githubCreatorId: 123, githubRequested: 1 });
    mock(schema, list([notionRow("Done")]), [githubIssue(7, "closed")]);
    await deliver(poll);
    await deliver(ghPoll);
    expect(await entries()).toHaveLength(1);

    await db().delete(changelogEntries);
    await db().update(posts).set({ status: "open", githubClosedAt: null }).where(eq(posts.id, ID));
    mock([githubIssue(7, "closed")], schema, list([notionRow("Done")]));
    await deliver(ghPoll);
    await deliver(poll);
    expect(await entries()).toHaveLength(1);
    expect(await links()).toHaveLength(1);
  });

  test("the GitHub close poll drafts", async () => {
    await seed({ githubNumber: 7, githubCreatorId: 123, githubRequested: 1 });
    mock([githubIssue(7, "closed")]);
    await deliver(ghPoll);
    expect((await entries()).map((entry) => entry.title)).toEqual(["Shipped: Export to CSV"]);
    expect(await links()).toHaveLength(1);
  });

  test("adopting an already-closed GitHub issue drafts", async () => {
    await seed({ githubRequested: 1 });
    mock([githubIssue(7, "closed")]);
    await deliver({ type: "github.issue", postId: ID });
    expect((await db().select().from(posts).where(eq(posts.id, ID)).get())!.status).toBe("done");
    expect(await entries()).toHaveLength(1);
    // Replaying the message (the issue is already linked now) adds nothing.
    mock([githubIssue(7, "closed")]);
    await deliver({ type: "github.issue", postId: ID });
    expect(await entries()).toHaveLength(1);
  });

  test("a status that is not Done drafts nothing", async () => {
    await seed();
    mock(schema, list([notionRow("In progress")]));
    await deliver(poll);
    expect(await entries()).toEqual([]);
  });

  test.each([
    ["hidden", { hiddenAt: 5 }],
    ["spam", { spam: 1, hiddenAt: 5 }],
    ["merged", { mergedInto: "other" }],
  ])("a %s post gets no draft", async (_name, patch) => {
    await seed();
    await db().insert(posts).values({
      id: "other",
      authorId: "author",
      title: "Other",
      body: "Other",
      category: "general",
      createdAt: 1,
      updatedAt: 1,
    });
    await db().update(posts).set(patch).where(eq(posts.id, ID));
    mock(schema, list([notionRow("Done")]));
    await deliver(poll);
    expect(await entries()).toEqual([]);
  });
});

describe("the changelog.autoDraft setting", () => {
  test("is on by default", async () => {
    await seed();
    mock(schema, list([notionRow("Done")]));
    await deliver(poll);
    expect(await entries()).toHaveLength(1);
  });

  test("off means no draft from any path, and the status still changes", async () => {
    await saveSettings({ changelog: { autoDraft: false } });
    await seed({ githubNumber: 7, githubCreatorId: 123, githubRequested: 1 });
    mock(schema, list([notionRow("Done")]));
    await deliver(poll);
    expect((await db().select().from(posts).where(eq(posts.id, ID)).get())!.status).toBe("done");
    await db().update(posts).set({ status: "open", githubClosedAt: null }).where(eq(posts.id, ID));
    mock([githubIssue(7, "closed")]);
    await deliver(ghPoll);
    expect(await entries()).toEqual([]);
    expect(await links()).toEqual([]);
  });

  test("turning it back on drafts the next Done only", async () => {
    await saveSettings({ changelog: { autoDraft: false } });
    await seed();
    mock(schema, list([notionRow("Done")]));
    await deliver(poll);
    expect(await entries()).toEqual([]);
    await saveSettings({ changelog: { autoDraft: null } }); // back to the default (on)
    await db().insert(posts).values({
      id: "22222222-2222-4222-8222-aaaaaaaaaaaa",
      authorId: "author",
      title: "Second",
      body: "Second body",
      category: "bug",
      createdAt: 1,
      updatedAt: 1,
      notionPageId: "page-2",
      notionRevision: 1,
    });
    mock(
      schema,
      list([notionRow("Done", false, "22222222-2222-4222-8222-aaaaaaaaaaaa", "page-2")]),
    );
    await deliver(poll);
    expect((await entries()).map((entry) => entry.title)).toEqual(["Shipped: Second"]);
  });
});
