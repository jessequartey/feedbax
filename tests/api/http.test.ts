import { beforeEach, expect, it } from "vite-plus/test";
import { env } from "cloudflare:workers";
import { resetEnv } from "../fixtures/cloudflare-workers.ts";
import { handlePosts, handleHealth, handleAuth } from "../../src/server/http.ts";
import { createAuth, viewerUser } from "../../src/server/auth.ts";
import config from "../../feedbax.config.ts";
import { form } from "./helpers.ts";
import { mintToken } from "./helpers.ts";

beforeEach(resetEnv);
it("authenticates bearer only and adds exact-origin CORS to success, errors, and preflight", async () => {
  const settings = { ...config, appUrl: "https://app.example.com/path" };
  const make = (method: string, origin: string, token?: string) =>
    new Request(`${env.PORTAL_URL}/api/posts`, {
      method,
      headers: { origin, ...(token ? { authorization: `Bearer ${token}` } : {}) },
      ...(method === "POST" ? { body: form() } : {}),
    });
  const preflight = await handlePosts(make("OPTIONS", "https://app.example.com"), settings);
  expect(preflight.status).toBe(204);
  expect(preflight.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
  expect(preflight.headers.has("access-control-allow-credentials")).toBe(false);
  const missing = await handlePosts(make("POST", "https://app.example.com"), settings);
  expect(missing.status).toBe(401);
  expect(missing.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
  const denied = await handlePosts(make("POST", "https://app.example.com.evil"), settings);
  expect(denied.status).toBe(403);
  expect(denied.headers.has("access-control-allow-origin")).toBe(false);
  const success = await handlePosts(
    make("POST", "https://app.example.com", await mintToken()),
    settings,
  );
  expect(success.status).toBe(201);
  expect(await success.json()).toMatchObject({
    postId: expect.any(String),
    postUrl: expect.any(String),
  });
  expect(success.headers.get("access-control-allow-origin")).toBe("https://app.example.com");
});
it("signs a host in through Better Auth and rejects replays without a replacement cookie", async () => {
  const token = await mintToken();
  const to = `/posts/${crypto.randomUUID()}`;
  const url = `${env.PORTAL_URL}/api/auth/feedbax/sign-in?token=${token}&to=${to}`;
  const response = await handleAuth(
    new Request(url, { method: "POST", headers: { origin: env.PORTAL_URL } }),
  );
  expect(response.status).toBe(302);
  expect(response.headers.get("location")).toBe(to);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  expect(await viewerUser(new Headers({ cookie }))).toMatchObject({
    name: "Host user",
    kind: "host",
  });
  const replay = await handleAuth(
    new Request(url, { method: "POST", headers: { origin: env.PORTAL_URL } }),
  );
  expect(replay.status).toBe(401);
  expect(replay.headers.has("set-cookie")).toBe(false);
  expect(await replay.text()).toContain("This link expired");
});
it("concurrent host arrivals converge on one user, and unsafe redirects fall back to /", async () => {
  const auth = createAuth();
  const tokens = await Promise.all([mintToken(), mintToken()]);
  const responses = await Promise.all(
    tokens.map((token) =>
      auth.handler(
        new Request(
          `${env.PORTAL_URL}/api/auth/feedbax/sign-in?token=${token}&to=https://evil.example`,
          { method: "POST", headers: { origin: env.PORTAL_URL } },
        ),
      ),
    ),
  );
  expect(responses.map((r) => r.status)).toEqual([302, 302]);
  expect(responses.map((r) => r.headers.get("location"))).toEqual(["/", "/"]);
  const viewers = await Promise.all(
    responses.map((r) =>
      viewerUser(new Headers({ cookie: r.headers.get("set-cookie")!.split(";")[0] })),
    ),
  );
  expect(viewers[0]!.id).toBe(viewers[1]!.id);
});
it("health reports provider failures without exposing details", async () => {
  expect(await (await handleHealth()).json()).toEqual({ ok: true, notion: "ok", github: "off" });
  await env.DB.prepare("INSERT INTO sync_state VALUES (?, ?, ?)")
    .bind("notion.error", JSON.stringify({ message: "SENTINEL_SECRET" }), Date.now())
    .run();
  expect(await (await handleHealth()).json()).toEqual({
    ok: true,
    notion: "failing",
    github: "off",
  });
});
