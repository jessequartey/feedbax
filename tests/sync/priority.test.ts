import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { eq } from "drizzle-orm";
import { resetEnv } from "../fixtures/cloudflare-workers.ts";
import { db } from "../../src/sync/shared.ts";
import { mirrorPost, pollNotion } from "../../src/sync/notion.ts";
import { posts, user } from "../../src/db/schema.ts";
import { NOTION_SCHEMA, NOTION_PRIORITY } from "../../src/integrations/notion-schema.ts";
import { setPostPriority } from "../../src/server/moderation.ts";
import { fakeFetch, ID, PAGE, SINCE, UNTIL, list, notionRow } from "./helpers.ts";

const schema = (enabled = true) => ({
  properties: { ...NOTION_SCHEMA, ...(enabled ? { Priority: NOTION_PRIORITY } : {}) },
});
const stamp = Date.parse(SINCE);
const row = (priority: unknown, edited = SINCE) => ({
  ...notionRow("Planned"),
  last_edited_time: edited,
  properties: {
    ...notionRow("Planned").properties,
    Priority: { type: "number", number: priority },
  },
});
const poll = () => pollNotion({ type: "notion.poll", since: SINCE, until: UNTIL, cursor: null });
const stored = () => db().select().from(posts).where(eq(posts.id, ID)).get();
function mock(...replies: unknown[]) {
  const fake = fakeFetch(...replies);
  vi.stubGlobal("fetch", fake.fetch);
  return fake;
}
beforeEach(async () => {
  await resetEnv();
  await db().insert(user).values({ id: "author", name: "Ada", email: "fake@example.invalid" });
  await db().insert(posts).values({
    id: ID,
    authorId: "author",
    title: "Idea",
    body: "Body",
    category: "feature",
    createdAt: 1,
    updatedAt: 1,
    notionPageId: PAGE,
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("optional Notion priority", () => {
  test.each([false, true])(
    "mirror skips absent property and pushes present property (%s)",
    async (enabled) => {
      await setPostPriority({ postId: ID, priority: 85 }, stamp + 1000);
      const fake = mock(schema(enabled), ...(enabled ? [row(20)] : []), { id: PAGE });
      await mirrorPost(ID);
      const properties = fake.requests.at(-1)!.body.properties;
      if (enabled) expect(properties).toHaveProperty("Priority.number", 85);
      else expect(properties).not.toHaveProperty("Priority");
      expect(properties).not.toHaveProperty("Status");
      expect(await stored()).toMatchObject({ notionRevision: 2, priority: 85 });
    },
  );
  test("creates a scored post and clears an existing score in Notion", async () => {
    await db().update(posts).set({ notionPageId: null }).where(eq(posts.id, ID));
    await setPostPriority({ postId: ID, priority: 0 }, stamp + 1000);
    const created = mock(schema(), list(), { id: PAGE });
    await mirrorPost(ID);
    expect(created.requests.at(-1)!.body).toHaveProperty("properties.Priority.number", 0);
    await setPostPriority({ postId: ID, priority: null }, stamp + 2000);
    const cleared = mock(schema(), row(0), { id: PAGE });
    await mirrorPost(ID);
    expect(cleared.requests.at(-1)!.body).toHaveProperty("properties.Priority.number", null);
  });
  test("mirror preserves a newer Notion edit for the poll", async () => {
    await setPostPriority({ postId: ID, priority: 90 }, stamp - 1000);
    const fake = mock(schema(), row(30), { id: PAGE });
    await mirrorPost(ID);
    expect(fake.requests.at(-1)!.body.properties).not.toHaveProperty("Priority");
    mock(schema(), list([row(30)]));
    await poll();
    expect(await stored()).toMatchObject({
      priority: 30,
      priorityUpdatedAt: stamp,
      status: "planned",
    });
  });
  test("mirror echoes cannot overwrite an admin edit made during the write", async () => {
    await setPostPriority({ postId: ID, priority: 80 }, stamp + 1000);
    mock(schema(), row(null), async () => {
      await setPostPriority({ postId: ID, priority: 95 }, stamp + 2000);
      return { id: PAGE };
    });
    await mirrorPost(ID);
    expect(await stored()).toMatchObject({ priority: 95, notionPriority: 80, revision: 3 });
    // The page timestamp is newer because of our PATCH, but 80 is our own echo.
    mock(schema(), list([row(80, UNTIL)]));
    await poll();
    expect(await stored()).toMatchObject({ priority: 95, notionPriority: 80 });
    const retry = mock(schema(), row(80, UNTIL), { id: PAGE });
    await mirrorPost(ID);
    expect(retry.requests.at(-1)!.body).toHaveProperty("properties.Priority.number", 95);
    expect(await stored()).toMatchObject({ priority: 95, notionPriority: 95, notionRevision: 3 });
  });
  test("a vote mirror preserves a later Notion score edit", async () => {
    await setPostPriority({ postId: ID, priority: 80 }, stamp + 1000);
    mock(schema(), row(null), { id: PAGE });
    await mirrorPost(ID);
    await db().update(posts).set({ revision: 3 }).where(eq(posts.id, ID));
    const fake = mock(schema(), row(25, UNTIL), { id: PAGE });
    await mirrorPost(ID);
    expect(fake.requests.at(-1)!.body.properties).not.toHaveProperty("Priority");
    mock(schema(), list([row(25, UNTIL)]));
    await poll();
    expect(await stored()).toMatchObject({ priority: 25, notionPriority: 25, revision: 3 });
  });
  test.each([false, true])(
    "poll with/without property keeps Status sync working (%s)",
    async (enabled) => {
      mock(schema(enabled), list([row(75)]));
      await poll();
      expect(await stored()).toMatchObject({
        status: "planned",
        priority: enabled ? 75 : null,
        revision: 1,
      });
    },
  );
  test("poll imports clears and zero, without echo revisions; replay cannot undo newer admin edit", async () => {
    mock(schema(), list([row(0)]));
    await poll();
    expect(await stored()).toMatchObject({ priority: 0, revision: 1 });
    mock(schema(), list([row(null, UNTIL)]));
    await poll();
    expect(await stored()).toMatchObject({ priority: null, revision: 1 });
    await setPostPriority({ postId: ID, priority: 99 }, Date.parse(UNTIL) + 1000);
    mock(schema(), list([row(10, UNTIL)]));
    await poll();
    expect(await stored()).toMatchObject({ priority: 99, revision: 2 });
  });
  test.each([-1, 101, 1.5, "10", undefined])(
    "invalid Notion score %j leaves priority unchanged but imports Status",
    async (score) => {
      mock(schema(), list([row(score)]));
      await poll();
      expect(await stored()).toMatchObject({ priority: null, status: "planned" });
    },
  );
  test("wrong optional property type is ignored silently", async () => {
    mock(
      { properties: { ...NOTION_SCHEMA, Priority: { type: "rich_text", rich_text: {} } } },
      list([row(5)]),
    );
    await poll();
    expect(await stored()).toMatchObject({ priority: null, status: "planned" });
  });
  test("a stale poll preserves newer D1 priority without changing Status sync", async () => {
    await setPostPriority({ postId: ID, priority: 80 }, stamp + 1000);
    mock(schema(), list([row(5)]));
    await poll();
    expect(await stored()).toMatchObject({ priority: 80, status: "planned" });
  });
  test("admin edit arriving between the poll's read and write wins", async () => {
    // The batch's SQL compares the current timestamp, not only the captured post snapshot.
    const fake = fakeFetch(schema(), list([row(5)]));
    vi.stubGlobal("fetch", fake.fetch);
    const database = db();
    const original = database.batch.bind(database);
    vi.spyOn(database, "batch").mockImplementationOnce(async (statements) => {
      await setPostPriority({ postId: ID, priority: 95 }, stamp + 1000);
      return original(statements);
    });
    await poll();
    expect(await stored()).toMatchObject({ priority: 95 });
  });
});
