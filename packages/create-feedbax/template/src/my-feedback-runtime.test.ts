import { afterEach, expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  createConnectedStore,
  createFeedbackModule,
  createPostOwnership,
} from "@feedbax/feedback";
import { createMyFeedbackRequestHandler } from "./my-feedback-runtime";
import { readSessionToken, sessionHash } from "./connected-identity";
let runtime: Miniflare | undefined;
afterEach(async () => {
  await runtime?.dispose();
});
it("scopes private submitted feedback to the authenticated session and rejects cross-origin owner writes", async () => {
  runtime = new Miniflare({
    modules: true,
    script: "export default {}",
    d1Databases: ["DB"],
    compatibilityDate: "2026-07-30",
  });
  const database = await runtime.getD1Database("DB");
  const directory = resolve(import.meta.dirname, "../migrations");
  for (const file of (await readdir(directory)).sort())
    await database.exec(
      (await readFile(resolve(directory, file), "utf8"))
        .replace(/--[^\n]*/g, "")
        .replace(/\s+/g, " "),
    );
  const store = createConnectedStore(database);
  const alice = { subject: "app:alice", displayName: "Alice" };
  const bob = { subject: "app:bob", displayName: "Bob" };
  for (const who of [alice, bob])
    await store.acceptIdentity({
      ...who,
      nonce: who.subject,
      sessionHash: sessionHash(who.subject),
      expiresAt: Date.now() + 60_000,
    });
  const modules = new Map<string, ReturnType<typeof createFeedbackModule>>();
  const factory = (who: typeof alice) => {
    if (!modules.has(who.subject))
      modules.set(
        who.subject,
        createFeedbackModule({ ownership: createPostOwnership(database, who) }),
      );
    return modules.get(who.subject)!;
  };
  const post = await factory(alice).submitPost({
    title: "Private pending submission",
    description: "Original Participant text",
    type: "Feature Request",
    submitter: { email: "private@example.com" },
  });
  const handler = createMyFeedbackRequestHandler({
    enabled: true,
    siteUrl: "https://portal.example",
    database,
    getParticipant: async (request) => {
      const token = readSessionToken(request);
      return token ? store.session(sessionHash(token)) : undefined;
    },
    getFeedback: factory,
    rateLimit: async () => true,
  });
  const request = (who?: string) =>
    new Request(
      "https://portal.example/internal/my-feedback?filter=submitted&subject=app:alice",
      { headers: who ? { Cookie: `__Host-feedbax-session=${who}` } : {} },
    );
  expect((await handler(request()))?.status).toBe(401);
  expect(await (await handler(request(bob.subject)))?.json()).toEqual({
    items: [],
  });
  const mine = await handler(request(alice.subject));
  expect(mine?.headers.get("Cache-Control")).toBe("no-store");
  const body = await mine?.text();
  expect(body).toContain("Private pending submission");
  expect(body).not.toContain("private@example.com");
  expect(body).not.toContain(alice.subject);
  const crossOrigin = await handler(
    new Request("https://portal.example/internal/my-feedback/post", {
      method: "POST",
      headers: {
        Cookie: `__Host-feedbax-session=${alice.subject}`,
        Origin: "https://attacker.example",
      },
      body: JSON.stringify({ action: "withdraw", id: post.id }),
    }),
  );
  expect(crossOrigin?.status).toBe(403);
});
