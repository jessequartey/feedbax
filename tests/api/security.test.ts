import { beforeEach, expect, it } from "vite-plus/test";
import { env } from "cloudflare:workers";
import { resetEnv } from "../fixtures/cloudflare-workers.ts";
import { createAuth, safeDestination } from "../../src/server/auth.ts";
import { handleAuth, handlePosts, allowedOrigin } from "../../src/server/http.ts";
import { form, mintToken } from "./helpers.ts";
import config from "../../feedbax.config.ts";

beforeEach(resetEnv);
it.each([
  "https://evil.example",
  "//evil.example",
  "/\\evil.example",
  "/posts/not-a-uuid",
  "/%2f%2fevil.example",
  "/posts/00000000-0000-4000-8000-000000000001?next=evil",
  "/posts/00000000-0000-4000-8000-000000000001\n",
])("rejects unsafe SSO destination %j", (to) => {
  expect(safeDestination(to)).toBe("/");
});
it("does not treat a portal account cookie as bearer authorization", async () => {
  const signup = await createAuth().handler(
    new Request(`${env.PORTAL_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: env.PORTAL_URL,
        "cf-connecting-ip": "192.0.2.8",
      },
      body: JSON.stringify({
        name: "Ada",
        email: "ada@example.com",
        password: "a long test password",
      }),
    }),
  );
  const response = await handlePosts(
    new Request(`${env.PORTAL_URL}/api/posts`, {
      method: "POST",
      headers: { cookie: signup.headers.get("set-cookie")!.split(";")[0] },
      body: form(),
    }),
  );
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ error: { code: "unauthenticated" } });
});
it("keeps Better Auth origin and CSRF checks enabled", async () => {
  const response = await handleAuth(
    new Request(`${env.PORTAL_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://evil.example",
        "cf-connecting-ip": "192.0.2.10",
      },
      body: JSON.stringify({
        name: "Ada",
        email: "ada@example.com",
        password: "a long test password",
      }),
    }),
  );
  expect(response.status).toBe(403);
  expect(await env.DB.prepare("SELECT count(*) as n FROM user").first()).toEqual({ n: 0 });
});
it("enforces 12–128 character passwords and a display name", async () => {
  for (const [name, password] of [
    ["Ada", "short"],
    ["Ada", "x".repeat(129)],
    ["", "a long test password"],
  ]) {
    const response = await handleAuth(
      new Request(`${env.PORTAL_URL}/api/auth/sign-up/email`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: env.PORTAL_URL,
          "cf-connecting-ip": "192.0.2.11",
        },
        body: JSON.stringify({ name, email: "ada@example.com", password }),
      }),
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
  }
});
it("sets HttpOnly, Lax, Secure cookies and seven-day sessions on HTTPS", async () => {
  const portal = "https://feedback.example.com";
  const auth = createAuth(config, { ...env, PORTAL_URL: portal });
  const response = await auth.handler(
    new Request(`${portal}/api/auth/sign-up/email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: portal,
        "cf-connecting-ip": "192.0.2.12",
      },
      body: JSON.stringify({
        name: "Ada",
        email: "ada@example.com",
        password: "a long test password",
      }),
    }),
  );
  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie")!;
  expect(cookie).toContain("HttpOnly");
  expect(cookie).toContain("SameSite=Lax");
  expect(cookie).toContain("Secure");
  expect(cookie).toContain("Max-Age=604800");
  const session = await env.DB.prepare(
    "SELECT expires_at - created_at AS lifetime FROM session",
  ).first<{ lifetime: number }>();
  expect(session!.lifetime).toBe(604800000);
});
it("only allows local development origins while the portal itself is local", () => {
  expect(allowedOrigin("http://localhost:5173")).toBe(true);
  for (const origin of [
    "http://localhost.evil:5173",
    "https://localhost:5173",
    "null",
    "https://evil.example",
    "http://localhost:5173/path",
  ])
    expect(allowedOrigin(origin)).toBe(false);
  const original = env.PORTAL_URL;
  try {
    env.PORTAL_URL = "https://feedback.example.com";
    expect(allowedOrigin("http://localhost:5173")).toBe(false);
  } finally {
    env.PORTAL_URL = original;
  }
});
it("rejects invalid multipart, duplicate scalars and oversized requests with safe HTTP errors", async () => {
  const malformed = await handlePosts(
    new Request(`${env.PORTAL_URL}/api/posts`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${await mintToken()}`,
        "content-type": "multipart/form-data; boundary=missing",
      },
      body: "bad",
    }),
  );
  expect(malformed.status).toBe(400);
  const duplicate = form();
  duplicate.append("title", "another");
  const result = await handlePosts(
    new Request(`${env.PORTAL_URL}/api/posts`, {
      method: "POST",
      headers: { authorization: `Bearer ${await mintToken()}` },
      body: duplicate,
    }),
  );
  expect(result.status).toBe(400);
  expect(await result.json()).toMatchObject({ error: { code: "invalid_input", field: "title" } });
  const oversized = await handlePosts(
    new Request(`${env.PORTAL_URL}/api/posts`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${await mintToken()}`,
        "content-type": "multipart/form-data; boundary=b",
        "content-length": "16000000",
      },
      body: "bad",
    }),
  );
  expect(oversized.status).toBe(413);
});

it("rejects a UUID with a trailing newline before it reaches SQL", async () => {
  const data = form(`${crypto.randomUUID()}\n`);
  const response = await handlePosts(
    new Request(`${env.PORTAL_URL}/api/posts`, {
      method: "POST",
      headers: { authorization: `Bearer ${await mintToken()}` },
      body: data,
    }),
  );
  expect(response.status).toBe(400);
});
it("leaves the current session in place when an SSO link is invalid", async () => {
  const response = await handleAuth(
    new Request(`${env.PORTAL_URL}/api/auth/feedbax/sign-in?token=invalid&to=//evil.example`, {
      headers: { cookie: "better-auth.session_token=existing" },
    }),
  );
  expect(response.status).toBe(401);
  expect(response.headers.has("set-cookie")).toBe(false);
  expect(await response.text()).not.toContain("evil.example");
});
it.each(["127.0.0.1", "[::1]"])(
  "permits same-host loopback development CORS for %s",
  (hostname) => {
    const portal = env.PORTAL_URL;
    try {
      env.PORTAL_URL = `http://${hostname}:3000`;
      expect(allowedOrigin(`http://${hostname}:5173`)).toBe(true);
      expect(allowedOrigin("http://localhost:5173")).toBe(false);
      env.PORTAL_URL = "https://feedback.example.com";
      expect(allowedOrigin(`http://${hostname}:5173`)).toBe(false);
    } finally {
      env.PORTAL_URL = portal;
    }
  },
);
