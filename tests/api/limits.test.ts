import { beforeEach, expect, it } from "vite-plus/test";
import { env } from "cloudflare:workers";
import { resetEnv } from "../fixtures/cloudflare-workers.ts";
import { form, writer, mintToken } from "./helpers.ts";
import { createPostForUser } from "../../src/server/posts.ts";
import { addCommentForUser } from "../../src/server/comments.ts";
import { handlePosts, handleAuth } from "../../src/server/http.ts";
import { createAuth } from "../../src/server/auth.ts";

beforeEach(resetEnv);
it("enforces post quota under concurrency and permits idempotent replays at quota", async () => {
  const user = await writer(),
    data = form();
  await createPostForUser(data, user);
  const attempts = await Promise.allSettled(
    Array.from({ length: 8 }, () => createPostForUser(form(), user)),
  );
  expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(4);
  for (const result of attempts)
    if (result.status === "rejected")
      expect(result.reason).toMatchObject({ code: "rate_limited", retryAfter: 3600 });
  expect((await createPostForUser(data, user)).status).toBe(200);
});
it("enforces comment quota under concurrency and rejects another author using the same ID", async () => {
  const user = await writer(),
    data = form();
  await createPostForUser(data, user);
  const postId = data.get("id") as string;
  const first = { id: crypto.randomUUID(), postId, body: "First comment" };
  await addCommentForUser(first, user);
  const results = await Promise.allSettled(
    Array.from({ length: 33 }, () =>
      addCommentForUser({ id: crypto.randomUUID(), postId, body: "comment" }, user),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(29);
  await expect(addCommentForUser(first, user)).resolves.toMatchObject({ id: first.id });
  await expect(addCommentForUser(first, await writer())).rejects.toMatchObject({
    code: "conflict",
  });
});
it("returns Retry-After and CORS on a bearer post quota failure", async () => {
  for (let i = 0; i < 5; i++)
    expect(
      (
        await handlePosts(
          new Request(`${env.PORTAL_URL}/api/posts`, {
            method: "POST",
            headers: {
              origin: "http://localhost:5000",
              authorization: `Bearer ${await mintToken()}`,
            },
            body: form(),
          }),
        )
      ).status,
    ).toBe(201);
  const response = await handlePosts(
    new Request(`${env.PORTAL_URL}/api/posts`, {
      method: "POST",
      headers: { origin: "http://localhost:5000", authorization: `Bearer ${await mintToken()}` },
      body: form(),
    }),
  );
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("3600");
  expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:5000");
  expect(response.headers.get("access-control-expose-headers")).toBe("Retry-After");
});
it("exposes Retry-After only to allowed origins", async () => {
  const preflight = await handlePosts(
    new Request(`${env.PORTAL_URL}/api/posts`, {
      method: "OPTIONS",
      headers: { origin: "http://localhost:5000" },
    }),
  );
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get("access-control-expose-headers")).toBe("Retry-After");
  const foreign = await handlePosts(
    new Request(`${env.PORTAL_URL}/api/posts`, {
      method: "POST",
      headers: { origin: "https://evil.example", authorization: "Bearer x" },
    }),
  );
  expect(foreign.status).toBe(403);
  expect(foreign.headers.get("access-control-allow-origin")).toBeNull();
  expect(foreign.headers.get("access-control-expose-headers")).toBeNull();
});
it.each(["sign-up/email", "sign-in/email"])(
  "Better Auth rate limits %s by Cloudflare IP using D1",
  async (path) => {
    const auth = createAuth();
    const request = (ip: string) =>
      new Request(`${env.PORTAL_URL}/api/auth/${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: env.PORTAL_URL,
          "cf-connecting-ip": ip,
        },
        body: JSON.stringify({ name: "Ada", email: "bad", password: "short" }),
      });
    for (let i = 0; i < 10; i++)
      expect((await auth.handler(request("192.0.2.55"))).status).not.toBe(429);
    const limited = await handleAuth(request("192.0.2.55"));
    expect(limited.status).toBe(429);
    expect(limited.headers.has("retry-after")).toBe(true);
    expect((await auth.handler(request("192.0.2.56"))).status).not.toBe(429);
    expect(
      (await env.DB.prepare("SELECT count(*) as n FROM rate_limit").first<{ n: number }>())!.n,
    ).toBeGreaterThan(0);
  },
);
