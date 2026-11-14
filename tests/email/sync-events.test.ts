import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import config from "../../feedbax.config.ts";
import { posts } from "../../src/db/schema.ts";
import type { SyncMessage } from "../../src/contracts/sync.ts";
import { NOTION_SCHEMA } from "../../src/integrations/notion-schema.ts";
import { consumeQueue } from "../../src/sync/index.ts";
import { db } from "../../src/sync/shared.ts";
import { resetEnv } from "../fixtures/cloudflare-workers.ts";
import {
  fakeFetch,
  githubIssue,
  ID,
  list,
  notionRow,
  PAGE,
  SINCE,
  UNTIL,
} from "../sync/helpers.ts";
import { account, disableEmail, enableEmail, post, queued } from "./helpers.ts";

// Where status emails come from: a status that actually changed in D1, once, only with email on.

const poll: SyncMessage = { type: "notion.poll", since: SINCE, until: UNTIL, cursor: null };
const ghPoll: SyncMessage = { type: "github.poll", since: SINCE, until: UNTIL, page: 1 };
const schema = { properties: NOTION_SCHEMA };

async function run(body: SyncMessage) {
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
const seed = async () => {
  await account("author");
  await post(ID, "author", {
    body: "Please **export** my data.",
    notionPageId: PAGE,
    notionRevision: 1,
    githubNumber: 7,
    githubCreatorId: 123,
  });
};

beforeEach(async () => {
  await resetEnv();
  enableEmail();
  config.integrations.github = { repo: "acme/app" };
  env.GITHUB_TOKEN = "github_test_only";
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  disableEmail();
  config.integrations.github = false;
  delete env.GITHUB_TOKEN;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("status change emails from sync", () => {
  test("a Notion status change queues one email with the Markdown body and its text", async () => {
    await seed();
    mock(schema, list([notionRow("Planned")]));
    await run(poll);
    expect(queued()).toEqual([
      expect.objectContaining({
        type: "email.status",
        from: "open",
        to: "planned",
        post: {
          id: ID,
          title: "Export to CSV",
          body: { markdown: "Please **export** my data.", text: "Please export my data." },
        },
      }),
    ]);
  });

  test("an unchanged status, or a replayed poll, queues nothing more", async () => {
    await seed();
    mock(schema, list([notionRow("Planned")]), schema, list([notionRow("Planned")]));
    await run(poll);
    await run(poll);
    expect(queued()).toHaveLength(1);
  });

  test("a GitHub close sets Done and queues one email", async () => {
    await seed();
    mock([githubIssue(7, "closed")]);
    await run(ghPoll);
    expect((await db().select().from(posts).where(eq(posts.id, ID)).get())!.status).toBe("done");
    expect(queued()).toEqual([
      expect.objectContaining({ type: "email.status", from: "open", to: "done" }),
    ]);
  });

  test("adopting an already-closed GitHub issue queues one email, and a replay none", async () => {
    await account("author");
    await post(ID, "author", { githubRequested: 1 });
    mock([githubIssue(7, "closed")]);
    await run({ type: "github.issue", postId: ID });
    expect(queued()).toEqual([expect.objectContaining({ type: "email.status", to: "done" })]);
    mock([githubIssue(7, "closed")]);
    await run({ type: "github.issue", postId: ID });
    expect(queued()).toHaveLength(1);
  });

  test("with email off, nothing is queued and the sync is unchanged", async () => {
    disableEmail();
    await seed();
    mock(schema, list([notionRow("Planned")]));
    await run(poll);
    expect((await db().select().from(posts).where(eq(posts.id, ID)).get())!.status).toBe("planned");
    expect(queued()).toEqual([]);
  });

  test("a queue that fails does not fail the sync or lose the stored change", async () => {
    await seed();
    const { queue } = await import("../fixtures/cloudflare-workers.ts");
    queue.failNext(1);
    mock(schema, list([notionRow("Planned")]));
    await run(poll);
    expect((await db().select().from(posts).where(eq(posts.id, ID)).get())!.status).toBe("planned");
  });
});
