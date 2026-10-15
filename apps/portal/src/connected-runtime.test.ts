import { expect, it } from "vitest";
import { Miniflare } from "miniflare";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  createConnectedStore,
  createConnectedFeedbackModule,
  createFeedbackModule,
} from "@feedbax/feedback";
import { createConnectedRequestHandler } from "./connected-runtime";
import { sessionHash } from "./connected-identity";
import feedbax from "./feedbax";

it("requires a valid session and same-origin mutations, and ignores browser-supplied Comment identity", async () => {
  const runtime = new Miniflare({
    modules: true,
    script: "export default {fetch(){return new Response('ok')}}",
    compatibilityDate: "2026-07-30",
    d1Databases: ["DB"],
  });
  try {
    const db = await runtime.getD1Database("DB");
    await db.exec(
      await readFile(
        existsSync("apps/portal/migrations/0001_connected.sql")
          ? "apps/portal/migrations/0001_connected.sql"
          : "migrations/0001_connected.sql",
        "utf8",
      ),
    );
    const store = createConnectedStore(db);
    const participant = { subject: "alice", displayName: "Alice" };
    await store.acceptIdentity({
      ...participant,
      nonce: "nonce",
      sessionHash: sessionHash("opaque-token"),
      expiresAt: Date.now() + 60000,
    });
    const config = {
      ...feedbax,
      product: { ...feedbax.product, siteUrl: "https://feedback.example" },
      connected: {
        issuer: "https://app.example",
        loginUrl: "https://app.example/login",
      },
    };
    const base = createFeedbackModule({
      initialItems: [
        {
          id: "post",
          slug: "post",
          title: "Post",
          description: "Public",
          type: "Feature Request",
          status: "Planned",
          published: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          voteCount: 99,
        },
      ],
    });
    const options = {
      config,
      environment: {
        PORTAL_SUBMISSIONS_RATE_LIMITER: {
          limit: async () => ({ success: true }),
        },
        PARTICIPATION_SIGNING_SECRET:
          "test-participation-secret-at-least-32-characters",
      },
      getStore: () => store,
      getFeedback: (identity: typeof participant) =>
        createConnectedFeedbackModule(base, store, identity),
    };
    const handle = createConnectedRequestHandler(options);
    const request = (
      path: string,
      body: unknown,
      cookie = "__Host-feedbax-session=opaque-token",
      origin = "https://feedback.example",
    ) =>
      new Request(`https://feedback.example${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookie,
          Origin: origin,
        },
        body: JSON.stringify(body),
      });
    expect(
      (
        await handle(
          request("/internal/votes", { slug: "post", intention: "add" }, ""),
        )
      )?.status,
    ).toBe(401);
    expect(
      (
        await handle(
          request(
            "/internal/votes",
            { slug: "post", intention: "add" },
            undefined,
            "https://evil.example",
          ),
        )
      )?.status,
    ).toBe(403);
    for (let i = 0; i < 2; i++)
      expect(
        await (
          await handle(
            request("/internal/votes", { slug: "post", intention: "add" }),
          )
        )?.json(),
      ).toMatchObject({ voteCount: 1 });
    const state = await handle(
      new Request(
        "https://feedback.example/internal/connected/votes?slug=post",
        { headers: { Cookie: "__Host-feedbax-session=opaque-token" } },
      ),
    );
    expect(state?.headers.get("cache-control")).toBe("no-store");
    expect(await state?.json()).toEqual({ voteCount: 1, voted: true });
    const comment = await handle(
      request("/internal/comments", {
        slug: "post",
        body: "Hello",
        displayName: "Fake Admin",
        email: "private@example.com",
        subject: "someone-else",
      }),
    );
    expect(comment?.status).toBe(200);
    const result = await comment?.json();
    expect(result.comment.author).toEqual({
      kind: "participant",
      displayName: "Alice",
      verified: true,
    });
    expect(JSON.stringify(result)).not.toContain("private@example.com");
    expect(JSON.stringify(result)).not.toContain("someone-else");
    const disabled = createConnectedRequestHandler({
      ...options,
      config: {
        ...config,
        features: { ...config.features, comments: false, voting: false },
      },
    });
    expect(
      (
        await disabled(
          request("/internal/comments", { slug: "post", body: "No" }),
        )
      )?.status,
    ).toBe(400);
    expect(
      (
        await disabled(
          request("/internal/votes", { slug: "post", intention: "add" }),
        )
      )?.status,
    ).not.toBe(200);
    const unavailable = createConnectedRequestHandler({
      ...options,
      getStore: () => {
        throw new Error("D1 unavailable");
      },
    });
    expect(
      (
        await unavailable(
          request("/internal/votes", { slug: "post", intention: "add" }),
        )
      )?.status,
    ).toBe(503);
  } finally {
    await runtime.dispose();
  }
});
