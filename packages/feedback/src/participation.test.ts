import { afterEach, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createConnectedStore } from "./connected";
import { createFeedbackModule } from "./index";
import { createParticipationModule } from "./participation";
import type { StoredComment } from "./notion-comments";

let runtime: Miniflare | undefined;
afterEach(async () => {
  const previous = runtime;
  runtime = undefined;
  await previous?.dispose();
});
const participant = { subject: "alice", displayName: "Alice" };

it("prepares migrated Follows without notifying about same-minute historical Comments", async () => {
  const { database } = await setup(true);
  const comments: StoredComment[] = [
    "before-migration",
    "after-preparation",
  ].map((id) => ({
    id,
    discussionId: id,
    postId: "public",
    body: id,
    author: { kind: "product-team", displayName: "Product Team" },
    createdAt: new Date(60000),
    resolved: false,
    scope: "page",
  }));
  const snapshot = async (count: number) =>
    createFeedbackModule({
      initialItems: [
        {
          id: "public",
          slug: "public",
          title: "Public Post",
          description: "Public",
          type: "Feature Request",
          status: "Planned",
          published: true,
          createdAt: new Date(1000),
          updatedAt: new Date(60000),
        },
      ],
      initialComments: comments.slice(0, count),
    });
  const follower = createParticipationModule({
    database,
    feedback: await snapshot(1),
    participant,
    now: () => 60020,
    processing: "small",
  });
  expect(await follower.followState("public")).toEqual({
    following: true,
    initializing: true,
  });
  await follower.synchronize();
  expect(await follower.followState("public")).toEqual({ following: true });
  expect((await follower.inbox()).items).toHaveLength(0);
  const worker = createParticipationModule({
    database,
    feedback: await snapshot(2),
    now: () => 60030,
    processing: "small",
  });
  await worker.synchronize();
  expect((await follower.inbox()).items.map((item) => item.kind)).toEqual([
    "comment",
  ]);
});

it("prepares a longer Comment history across bounded runs before activating updates", async () => {
  const { database } = await setup();
  const comments: StoredComment[] = Array.from({ length: 52 }, (_, i) => ({
    id: `c${i}`,
    discussionId: `d${i}`,
    postId: "history",
    body: "History",
    author: { kind: "product-team", displayName: "Product Team" },
    createdAt: new Date(60000),
    resolved: false,
    scope: "page",
  }));
  const snapshot = (count: number) =>
    createFeedbackModule({
      initialItems: [
        {
          id: "history",
          slug: "history",
          title: "History",
          description: "Public",
          type: "Feature Request",
          status: "Planned",
          published: true,
          createdAt: new Date(1000),
          updatedAt: new Date(60000),
        },
      ],
      initialComments: comments.slice(0, count),
    });
  const follower = createParticipationModule({
    database,
    feedback: snapshot(51),
    participant,
    now: () => 60010,
  });
  expect(await follower.follow("history", true)).toEqual({
    following: true,
    initializing: true,
  });
  expect(await follower.followState("history")).toEqual({
    following: true,
    initializing: true,
  });
  const preparation = createParticipationModule({
    database,
    feedback: snapshot(51),
    now: () => 60020,
    processing: "small",
  });
  await preparation.synchronize();
  expect(await follower.followState("history")).toEqual({ following: true });
  expect((await follower.inbox()).items).toHaveLength(0);
  const worker = createParticipationModule({
    database,
    feedback: snapshot(52),
    now: () => 60030,
    processing: "small",
  });
  await worker.synchronize();
  await worker.synchronize();
  expect((await follower.inbox()).items.map((item) => item.kind)).toEqual([
    "comment",
  ]);
  await follower.follow("history", false);
  expect(await follower.follow("history", true)).toEqual({
    following: true,
    initializing: true,
  });
  await follower.follow("history", false);
  expect(await preparation.synchronize()).toEqual({ checked: 0, failed: 0 });
  expect(await follower.followState("history")).toEqual({ following: false });
});

it("distinguishes existing and new Comments within the same coarse Notion minute", async () => {
  const { database } = await setup();
  const comments: StoredComment[] = ["old", "new"].map((id) => ({
    id,
    discussionId: id,
    postId: "precision",
    body: id,
    author: { kind: "product-team", displayName: "Product Team" },
    createdAt: new Date(60000),
    resolved: false,
    scope: "page",
  }));
  const snapshot = (initialComments: StoredComment[]) =>
    createFeedbackModule({
      initialItems: [
        {
          id: "precision",
          slug: "precision",
          title: "Precision",
          description: "Public",
          type: "Feature Request",
          status: "Planned",
          published: true,
          createdAt: new Date(1000),
          updatedAt: new Date(60000),
        },
      ],
      initialComments,
    });
  const follower = createParticipationModule({
    database,
    feedback: snapshot(comments.slice(0, 1)),
    participant,
    now: () => 60010,
  });
  await follower.follow("precision", true);
  const worker = createParticipationModule({
    database,
    feedback: snapshot(comments),
    now: () => 60030,
  });
  await createParticipationModule({
    database,
    feedback: snapshot(comments),
    participant,
    now: () => 60020,
  }).follow("precision", true);
  await worker.synchronize();
  expect((await follower.inbox()).items.map((item) => item.kind)).toEqual([
    "comment",
  ]);
  await worker.synchronize();
  expect((await follower.inbox()).items).toHaveLength(1);
});

it("observes status transitions within Notion's timestamp precision without notifying a new follower about earlier changes", async () => {
  const { database } = await setup();
  const snapshot = (status: "Planned" | "In Progress") =>
    createFeedbackModule({
      initialItems: [
        {
          id: "precision",
          slug: "precision",
          title: "Status precision",
          description: "Public",
          type: "Feature Request",
          status,
          published: true,
          createdAt: new Date(1000),
          updatedAt: new Date(60000),
        },
      ],
    });
  const alice = createParticipationModule({
    database,
    feedback: snapshot("Planned"),
    participant,
    now: () => 60010,
  });
  await alice.follow("precision", true);
  const bobIdentity = { subject: "bob", displayName: "Bob" };
  await createConnectedStore(database).acceptIdentity({
    ...bobIdentity,
    nonce: "bob",
    sessionHash: "bob",
    expiresAt: 100000,
  });
  const bob = createParticipationModule({
    database,
    feedback: snapshot("In Progress"),
    participant: bobIdentity,
    now: () => 60020,
  });
  await bob.follow("precision", true);
  let clock = 60030;
  const worker = (status: "Planned" | "In Progress") =>
    createParticipationModule({
      database,
      feedback: snapshot(status),
      now: () => clock,
    });
  expect(await worker("In Progress").synchronize()).toEqual({
    checked: 1,
    failed: 0,
  });
  expect((await alice.inbox()).items).toHaveLength(1);
  expect((await bob.inbox()).items).toHaveLength(0);
  clock = 60040;
  await worker("Planned").synchronize();
  expect((await alice.inbox()).items).toHaveLength(2);
  expect((await bob.inbox()).items).toHaveLength(1);
  clock = 60050;
  await worker("In Progress").synchronize();
  expect((await alice.inbox()).items).toHaveLength(3);
  expect((await bob.inbox()).items).toHaveLength(2);
});

it("small processing resumes one followed Post and one pending email per run", async () => {
  const { database } = await setup();
  const posts = (status: "Planned" | "In Progress", updatedAt: number) =>
    createFeedbackModule({
      initialItems: ["first", "second"].map((slug) => ({
        id: slug,
        slug,
        title: slug,
        description: "Public",
        type: "Feature Request",
        status,
        published: true,
        createdAt: new Date(1000),
        updatedAt: new Date(updatedAt),
      })),
    });
  await createConnectedStore(database).acceptIdentity({
    ...participant,
    email: "alice@example.com",
    nonce: "email",
    sessionHash: "email",
    expiresAt: 100000,
  });
  const sent: string[] = [];
  const email = {
    sender: async (message: { subject: string }) => {
      sent.push(message.subject);
    },
    from: "updates@example.com",
    siteUrl: "https://feedback.example",
    unsubscribeSecret: "test-unsubscribe-secret-at-least-32-characters",
  };
  const follower = createParticipationModule({
    database,
    feedback: posts("Planned", 1000),
    participant,
    now: () => 2000,
    email,
  });
  await follower.follow("first", true);
  await follower.follow("second", true);
  await follower.setEmailPreference(true);
  const worker = createParticipationModule({
    database,
    feedback: posts("In Progress", 3000),
    participant,
    now: () => 4000,
    email,
    processing: "small",
  });
  expect(await worker.synchronize()).toEqual({ checked: 1, failed: 0 });
  expect((await worker.inbox()).items).toHaveLength(1);
  expect(await worker.synchronize()).toEqual({ checked: 1, failed: 0 });
  expect((await worker.inbox()).items).toHaveLength(2);
  expect(await worker.deliverEmails()).toEqual({ sent: 1, failed: 0 });
  expect(sent).toHaveLength(1);
  expect(await worker.deliverEmails()).toEqual({ sent: 1, failed: 0 });
  expect(sent).toHaveLength(2);
  expect(await worker.deliverEmails()).toEqual({ sent: 0, failed: 0 });
});
async function setup(legacyFollow = false) {
  runtime = new Miniflare({
    modules: true,
    script: "export default {fetch(){return new Response('ok')}}",
    compatibilityDate: "2026-07-30",
    d1Databases: ["DB"],
  });
  const database = await runtime.getD1Database("DB");
  for (const name of ["0001_connected.sql", "0002_participation.sql"])
    await database.exec(
      await readFile(
        `${existsSync("apps/portal/migrations") ? "apps/portal/migrations" : "migrations"}/${name}`,
        "utf8",
      ),
    );
  await createConnectedStore(database).acceptIdentity({
    ...participant,
    nonce: "a",
    sessionHash: "a",
    expiresAt: 100000,
  });
  if (legacyFollow)
    await database.exec(
      "INSERT INTO post_observations (post_slug,status,checked_at) VALUES ('public','Planned',60000); INSERT INTO post_follows (post_slug,subject,followed_at) VALUES ('public','alice',60010);",
    );
  await database.exec(
    await readFile(
      `${existsSync("apps/portal/migrations") ? "apps/portal/migrations" : "migrations"}/0004_followed_status.sql`,
      "utf8",
    ),
  );
  const feedback = createFeedbackModule({
    initialItems: [
      {
        id: "public",
        slug: "public",
        title: "Public Post",
        description: "Description",
        type: "Feature Request",
        status: "Planned",
        published: true,
        createdAt: new Date(1000),
        updatedAt: new Date(1000),
      },
      {
        id: "private",
        slug: "private",
        title: "Private Post",
        description: "Private",
        type: "Feature Request",
        status: "New",
        published: false,
        createdAt: new Date(1000),
        updatedAt: new Date(1000),
      },
    ],
  });
  return { database, feedback };
}
it("follows a Published Post once across browsers and rejects private Posts or unsigned Participants", async () => {
  const options = await setup();
  const first = createParticipationModule({
    ...options,
    participant,
    now: () => 2000,
  });
  await Promise.all([
    first.follow("public", true),
    first.follow("public", true),
  ]);
  const second = createParticipationModule({ ...options, participant });
  expect(await second.followState("public")).toEqual({ following: true });
  await expect(first.follow("private", true)).rejects.toThrow("unavailable");
  await expect(
    createParticipationModule(options).follow("public", true),
  ).rejects.toThrow("Sign in");
  await second.follow("public", false);
  expect(await first.followState("public")).toEqual({ following: false });
  expect(await first.inbox()).toEqual({ items: [], unreadCount: 0 });
});

it("notifies only followers about later status changes and Comments, deduplicates synchronization, and keeps read state private", async () => {
  const options = await setup();
  const alice = createParticipationModule({
    ...options,
    participant,
    now: () => 2000,
  });
  await alice.follow("public", true);
  const changed = createFeedbackModule({
    initialItems: [
      {
        id: "public",
        slug: "public",
        title: "Public Post",
        description: "Description",
        type: "Feature Request",
        status: "Shipped",
        published: true,
        createdAt: new Date(1000),
        updatedAt: new Date(3000),
      },
    ],
  });
  const sync = createParticipationModule({
    ...options,
    feedback: changed,
    now: () => 4000,
  });
  await Promise.all([sync.synchronize(), sync.synchronize()]);
  await sync.synchronize();
  const inbox = await alice.inbox();
  expect(inbox.items).toHaveLength(1);
  expect(inbox.items[0]).toMatchObject({
    slug: "public",
    kind: "status",
    message: "Status changed to Shipped.",
    read: false,
  });
  expect(inbox.unreadCount).toBe(1);
  expect(JSON.stringify(inbox)).not.toContain("alice");
  const bob = createParticipationModule({
    ...options,
    participant: { subject: "bob", displayName: "Bob" },
  });
  expect(await bob.inbox()).toEqual({ items: [], unreadCount: 0 });
  await bob.markRead(inbox.items[0]!.id);
  expect((await alice.inbox()).unreadCount).toBe(1);
  await alice.markRead(inbox.items[0]!.id);
  expect((await alice.inbox()).unreadCount).toBe(0);
  await changed.createComment({
    slug: "public",
    body: "Now available",
    displayName: "Team",
  });
  await sync.synchronize();
  expect((await alice.inbox()).items.map((item) => item.kind)).toEqual([
    "comment",
    "status",
  ]);
  const hidden = createParticipationModule({
    ...options,
    feedback: createFeedbackModule(),
    participant,
  });
  expect(await hidden.inbox()).toEqual({ items: [], unreadCount: 0 });
});

it("emails only verified opted-in followers, retries with a stable delivery key, and honors unsubscribe", async () => {
  const options = await setup();
  const { createEmailSender } = await import("./email-delivery");
  const calls: Request[] = [];
  let fail = true;
  const sender = createEmailSender({
    provider: "resend",
    token: "private-key",
    request: async (input, init) => {
      calls.push(new Request(input, init));
      return new Response(
        fail ? "unavailable" : JSON.stringify({ id: "sent" }),
        { status: fail ? 503 : 200 },
      );
    },
  });
  let clock = 2000;
  const email = {
    sender,
    from: "updates@example.com",
    siteUrl: "https://feedback.example.com",
    unsubscribeSecret: "x".repeat(32),
  };
  const alice = createParticipationModule({
    ...options,
    participant,
    now: () => clock,
    email,
  });
  await expect(alice.setEmailPreference(true)).rejects.toThrow("verified");
  await createConnectedStore(options.database).acceptIdentity({
    ...participant,
    email: "alice@example.com",
    nonce: "email-identity",
    sessionHash: "email-identity",
    expiresAt: 100000,
  });
  await alice.setEmailPreference(true);
  await alice.follow("public", true);
  const changed = createFeedbackModule({
    initialItems: [
      {
        id: "public",
        slug: "public",
        title: "Public Post",
        description: "Description",
        type: "Feature Request",
        status: "Shipped",
        published: true,
        createdAt: new Date(1000),
        updatedAt: new Date(3000),
      },
    ],
  });
  const sync = createParticipationModule({
    ...options,
    feedback: changed,
    now: () => clock,
    email,
  });
  clock = 4000;
  await sync.synchronize();
  expect(await sync.deliverEmails()).toEqual({ sent: 0, failed: 1 });
  fail = false;
  clock += 61000;
  expect(await sync.deliverEmails()).toEqual({ sent: 1, failed: 0 });
  expect(calls[0]!.headers.get("Idempotency-Key")).toBe(
    calls[1]!.headers.get("Idempotency-Key"),
  );
  expect(calls[1]!.headers.get("Authorization")).toBe("Bearer private-key");
  const message = JSON.parse(await calls[1]!.text());
  expect(message.to).toEqual(["alice@example.com"]);
  const unsubscribe = new URL(message.headers["List-Unsubscribe"].slice(1, -1));
  await sync.unsubscribe(unsubscribe.searchParams.get("token")!);
  expect(await alice.preferences()).toEqual({
    emailAvailable: true,
    emailEnabled: false,
  });
  expect(await sync.deliverEmails()).toEqual({ sent: 0, failed: 0 });
  expect(JSON.stringify(await alice.inbox())).not.toContain(
    "alice@example.com",
  );
});

it("rolls back an event and its notifications if the observation checkpoint fails", async () => {
  const options = await setup();
  const alice = createParticipationModule({
    ...options,
    participant,
    now: () => 2000,
  });
  await alice.follow("public", true);
  await options.database.exec(
    "CREATE TRIGGER reject_checkpoint BEFORE UPDATE OF status ON post_observations WHEN NEW.status='Shipped' BEGIN SELECT RAISE(ABORT, 'checkpoint unavailable'); END;",
  );
  const changed = createFeedbackModule({
    initialItems: [
      {
        id: "public",
        slug: "public",
        title: "Public Post",
        description: "Description",
        type: "Feature Request",
        status: "Shipped",
        published: true,
        createdAt: new Date(1000),
        updatedAt: new Date(3000),
      },
    ],
  });
  const sync = createParticipationModule({
    ...options,
    feedback: changed,
    now: () => 4000,
  });
  expect((await sync.synchronize()).failed).toBe(1);
  expect((await alice.inbox()).items).toHaveLength(0);
  await options.database.exec("DROP TRIGGER reject_checkpoint;");
  await sync.synchronize();
  await sync.synchronize();
  expect((await alice.inbox()).items).toHaveLength(1);
  const hidden = createParticipationModule({
    ...options,
    feedback: createFeedbackModule(),
    participant,
  });
  await hidden.follow("public", false);
  expect(await alice.followState("public")).toEqual({ following: false });
});

it("supports Cloudflare structured sending and an authenticated custom HTTPS adapter without following redirects", async () => {
  const { createEmailSender } = await import("./email-delivery");
  const message = {
    from: "updates@example.com",
    to: ["recipient@example.com"],
    subject: "An update",
    text: "A Post changed.",
    headers: {
      "List-Unsubscribe": "<https://feedback.example.com/unsubscribe>",
    },
  };
  let accepted: unknown;
  await createEmailSender({
    provider: "cloudflare",
    binding: {
      send: async (value) => {
        accepted = value;
      },
    },
  })(message, "delivery-1");
  expect(accepted).toEqual(message);
  let custom: Request | undefined;
  await createEmailSender({
    provider: "custom",
    url: "https://app.example.com/email",
    token: "private-adapter-key",
    request: async (input, init) => {
      custom = new Request(input, init);
      return new Response(null, { status: 202 });
    },
  })(message, "delivery-2");
  expect(custom?.headers.get("Idempotency-Key")).toBe("delivery-2");
  expect(custom?.redirect).toBe("manual");
  expect(custom?.headers.get("Authorization")).toBe(
    "Bearer private-adapter-key",
  );
  expect(() =>
    createEmailSender({
      provider: "custom",
      url: "http://app.example.com/email",
      token: "x",
    }),
  ).toThrow("HTTPS");
});
