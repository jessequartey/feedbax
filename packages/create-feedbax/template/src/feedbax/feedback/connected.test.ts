import { afterEach, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createConnectedStore } from "./connected";

let runtime: Miniflare | undefined;
afterEach(async () => {
  await runtime?.dispose();
});
async function migratedDatabase() {
  runtime = new Miniflare({
    modules: true,
    script: "export default {fetch(){return new Response('ok')}}",
    compatibilityDate: "2026-07-30",
    d1Databases: ["DB"],
  });
  const binding = await runtime.getD1Database("DB");
  await binding.exec(
    (await readFile(
      existsSync("apps/portal/migrations/0001_connected.sql")
        ? "apps/portal/migrations/0001_connected.sql"
        : "migrations/0001_connected.sql",
      "utf8",
    )) +
      "\n" +
      (await readFile(
        existsSync("apps/portal/migrations/0002_participation.sql")
          ? "apps/portal/migrations/0002_participation.sql"
          : "migrations/0002_participation.sql",
        "utf8",
      )),
  );
  return binding;
}

it("persists one Vote per verified Participant across concurrent retries and browsers", async () => {
  const binding = await migratedDatabase();
  const store = createConnectedStore(binding);
  await store.acceptIdentity({
    subject: "alice",
    displayName: "Alice",
    nonce: "once",
    sessionHash: "session",
    expiresAt: Date.now() + 60000,
  });
  await Promise.all(
    Array.from({ length: 8 }, () => store.setVote("post-1", "alice", true)),
  );
  expect(await store.voteState("post-1", "alice")).toEqual({
    voteCount: 1,
    voted: true,
  });
  const secondBrowser = createConnectedStore(binding);
  expect(await secondBrowser.voteState("post-1", "alice")).toEqual({
    voteCount: 1,
    voted: true,
  });
  await secondBrowser.setVote("post-1", "alice", false);
  await secondBrowser.setVote("post-1", "alice", false);
  expect(await store.voteState("post-1", "alice")).toEqual({
    voteCount: 0,
    voted: false,
  });
});
it("rejects replayed handoffs without replacing an existing Participant or creating a session", async () => {
  const binding = await migratedDatabase();
  const store = createConnectedStore(binding);
  const input = {
    subject: "alice",
    displayName: "Alice",
    nonce: "once",
    sessionHash: "session",
    expiresAt: 2000,
  };
  await store.acceptIdentity(input);
  await expect(
    store.acceptIdentity({
      ...input,
      displayName: "Changed",
      sessionHash: "replay",
    }),
  ).rejects.toThrow();
  expect(await store.session("session", 1500)).toEqual({
    subject: "alice",
    displayName: "Alice",
  });
  expect(await store.session("replay", 1500)).toBeUndefined();
  expect(await store.session("session", 2000)).toBeUndefined();
  await store.logout("session");
  expect(await store.session("session", 1500)).toBeUndefined();
});

it("ranks by verified Votes and attributes only Comments with identity evidence", async () => {
  const binding = await migratedDatabase();
  const store = createConnectedStore(binding);
  const alice = { subject: "alice", displayName: "Alice" };
  await store.acceptIdentity({
    ...alice,
    nonce: "a",
    sessionHash: "a",
    expiresAt: Date.now() + 60000,
  });
  const { createFeedbackModule, createConnectedFeedbackModule } =
    await import("./index");
  const base = createFeedbackModule({
    initialItems: [
      {
        id: "p1",
        slug: "old-popular",
        title: "Old",
        description: "Old",
        type: "Feature Request",
        status: "Planned",
        published: true,
        createdAt: new Date(1000),
        updatedAt: new Date(1000),
        voteCount: 500,
      },
      {
        id: "p2",
        slug: "new",
        title: "New",
        description: "New",
        type: "Feature Request",
        status: "Planned",
        published: true,
        createdAt: new Date(2000),
        updatedAt: new Date(2000),
        voteCount: 0,
      },
      {
        id: "private",
        slug: "private",
        title: "Private",
        description: "Private",
        type: "Feature Request",
        status: "New",
        published: false,
        createdAt: new Date(2000),
        updatedAt: new Date(2000),
        voteCount: 0,
      },
    ],
    initialComments: [
      {
        id: "old",
        postId: "p1",
        discussionId: "thread",
        body: "Old",
        author: { kind: "participant", displayName: "Unverified Alice" },
        createdAt: new Date(1000),
        resolved: false,
      },
      {
        id: "team",
        postId: "p1",
        discussionId: "thread",
        body: "Team",
        author: { kind: "product-team", displayName: "Product Team" },
        createdAt: new Date(2000),
        resolved: false,
      },
      {
        id: "resolved",
        postId: "p1",
        discussionId: "resolved",
        body: "Hidden",
        author: { kind: "product-team", displayName: "Product Team" },
        createdAt: new Date(2000),
        resolved: true,
      },
    ],
  });
  const signedIn = createConnectedFeedbackModule(base, store, alice);
  const publicRead = createConnectedFeedbackModule(base, store);
  expect((await publicRead.getPublicPost("old-popular"))?.voteCount).toBe(0);
  await signedIn.changeVote({ slug: "old-popular", intention: "add" });
  expect(
    (await publicRead.listPublicPosts({ sort: "top" })).items.map(
      (p) => p.slug,
    ),
  ).toEqual(["old-popular", "new"]);
  expect(
    (await publicRead.listPublicPosts({ sort: "new" })).items.map(
      (p) => p.slug,
    ),
  ).toEqual(["new", "old-popular"]);
  await expect(
    signedIn.changeVote({ slug: "private", intention: "add" }),
  ).rejects.toThrow();
  await expect(
    publicRead.changeVote({ slug: "new", intention: "add" }),
  ).rejects.toThrow("Sign in");
  const comment = await signedIn.createComment({
    slug: "old-popular",
    body: "Hello",
    displayName: "Spoofed Admin",
  });
  expect(comment.author).toEqual({
    kind: "participant",
    displayName: "Alice",
    verified: true,
  });
  const comments = (
    await publicRead.listCommentThreads({ slug: "old-popular" })
  ).items.flatMap((t) => t.comments);
  expect(comments.find((c) => c.id === "old")?.author).toEqual({
    kind: "participant",
    displayName: "Unverified Alice",
  });
  expect(comments.find((c) => c.id === "team")?.author).toEqual({
    kind: "product-team",
    displayName: "Product Team",
  });
  expect(comments.some((c) => c.id === "resolved")).toBe(false);
  expect(comments.find((c) => c.id === comment.id)?.author).toEqual(
    comment.author,
  );
  expect(JSON.stringify(comments)).not.toContain('"subject"');
  expect(
    (await signedIn.editComment({ commentId: comment.id, body: "Edited" }))
      .author,
  ).toEqual(comment.author);
  const other = createConnectedFeedbackModule(base, store, {
    subject: "bob",
    displayName: "Bob",
  });
  await expect(
    other.editComment({ commentId: comment.id, body: "Impersonated" }),
  ).rejects.toThrow();
});

it("keeps Top pagination at 25 Posts and binds cursors to their filters", async () => {
  const store = createConnectedStore(await migratedDatabase());
  const { createFeedbackModule, createConnectedFeedbackModule } =
    await import("./index");
  const base = createFeedbackModule({
    initialItems: Array.from({ length: 26 }, (_, i) => ({
      id: `id-${i}`,
      slug: `post-${i}`,
      title: `Post ${i}`,
      description: "Description",
      type: "Feature Request",
      status: "Planned",
      published: true,
      createdAt: new Date(i * 1000),
      updatedAt: new Date(i * 1000),
      voteCount: 0,
    })),
  });
  const feedback = createConnectedFeedbackModule(base, store);
  const first = await feedback.listPublicPosts({ sort: "top" });
  expect(first.items).toHaveLength(25);
  expect(first.nextCursor).toBeTruthy();
  const second = await feedback.listPublicPosts({
    sort: "top",
    cursor: first.nextCursor,
  });
  expect(second.items).toHaveLength(1);
  expect(second.nextCursor).toBeUndefined();
  expect(
    new Set([...first.items, ...second.items].map((post) => post.slug)).size,
  ).toBe(26);
  await expect(
    feedback.listPublicPosts({
      sort: "top",
      type: "Bug Report",
      cursor: first.nextCursor,
    }),
  ).rejects.toThrow();
});
