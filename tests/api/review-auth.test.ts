import { beforeEach, expect, it, vi } from "vite-plus/test";
import { env } from "cloudflare:workers";
import { resetEnv } from "../fixtures/cloudflare-workers.ts";
import { createAuth } from "../../src/server/auth.ts";
import { verifyHostToken, resolveHostUser } from "../../src/server/host-token.ts";
import { mintFeedbaxToken } from "../../registry/feedbax-feedback/lib/token.server.ts";
import { mintToken } from "./helpers.ts";

beforeEach(resetEnv);
function post(auth: ReturnType<typeof createAuth>, path: string, body: unknown, cookie = "") {
  return auth.handler(
    new Request(`${env.PORTAL_URL}/api/auth/${path}`, {
      method: "POST",
      headers: { origin: env.PORTAL_URL, "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    }),
  );
}
it("validates names through mounted update-user before storing or publishing them", async () => {
  const auth = createAuth();
  const signup = await post(auth, "sign-up/email", {
    name: "Ada",
    email: "ada@example.com",
    password: "a long test password",
  });
  const cookie = signup.headers.get("set-cookie")!.split(";")[0];
  for (const name of ["", "   ", 42, {}, "x".repeat(81), "x".repeat(100000)]) {
    expect((await post(auth, "update-user", { name }, cookie)).status).toBeGreaterThanOrEqual(400);
    expect(await env.DB.prepare("SELECT name FROM user").first()).toEqual({ name: "Ada" });
  }
  expect((await post(auth, "update-user", { name: "🦊".repeat(80) }, cookie)).status).toBe(200);
});
it.each(["host-x@users.feedbax.invalid", "HOST-X@USERS.FEEDBAX.INVALID"])(
  "reserves internal email namespace at public signup: %s",
  async (email) => {
    expect(
      (
        await post(createAuth(), "sign-up/email", {
          name: "Squatter",
          email,
          password: "a long test password",
        })
      ).status,
    ).toBeGreaterThanOrEqual(400);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM user").first()).toEqual({ n: 0 });
  },
);
it.each([0, 1, 15, 16, 31])(
  "rejects a %i byte host secret as configuration, on both sides",
  async (size) => {
    const secret = Buffer.alloc(size, 97).toString("base64url");
    const original = env.FEEDBAX_HOST_SECRET;
    let token: string;
    try {
      if (size) env.FEEDBAX_HOST_SECRET = secret;
      token = await mintToken();
    } finally {
      env.FEEDBAX_HOST_SECRET = original;
    }
    await expect(verifyHostToken(token, secret)).rejects.toMatchObject({
      code: "unavailable",
      message: expect.stringContaining("FEEDBAX_HOST_SECRET"),
    });
    await expect(mintFeedbaxToken({ secret, user: { id: "u", name: "Ada" } })).rejects.toThrow(
      /FEEDBAX_HOST_SECRET/,
    );
  },
);
it("aligns canonical keys and Unicode claims between mint and verify", async () => {
  for (const secret of [env.FEEDBAX_HOST_SECRET + "=", "A".repeat(42) + "B"]) {
    await expect(verifyHostToken(await mintToken(), secret)).rejects.toMatchObject({
      code: "unavailable",
    });
    await expect(mintFeedbaxToken({ secret, user: { id: "u", name: "Ada" } })).rejects.toThrow();
  }
  for (const user of [
    { id: "   ", name: "Ada" },
    { id: "u\u2028x", name: "Ada" },
    { id: "u", name: "   " },
  ])
    await expect(mintFeedbaxToken({ secret: env.FEEDBAX_HOST_SECRET, user })).rejects.toThrow();
  const user = { id: "🦊".repeat(200), name: "🦊".repeat(80) };
  const token = await mintFeedbaxToken({ secret: env.FEEDBAX_HOST_SECRET, user });
  expect(await verifyHostToken(token)).toMatchObject({ sub: user.id, name: user.name });
});
it("does not write an unchanged host name, or attach a squatted email", async () => {
  const adapter = (await createAuth().$context).internalAdapter;
  const claims = await verifyHostToken(await mintToken());
  const user = await resolveHostUser(claims, adapter);
  const update = vi.spyOn(adapter, "updateUser");
  expect((await resolveHostUser(claims, adapter)).id).toBe(user.id);
  expect(update).not.toHaveBeenCalled();
  update.mockRestore();
});
it("GET SSO confirms escaped identity without consuming or replacing a session; POST rejects sibling origins", async () => {
  const auth = createAuth();
  const token = await mintToken({ name: "<img src=x onerror=alert(1)>" });
  const url = `${env.PORTAL_URL}/api/auth/feedbax/sign-in?token=${token}`;
  const get = await auth.handler(new Request(url, { headers: { "sec-fetch-site": "cross-site" } }));
  expect(get.status).toBe(200);
  expect(get.headers.has("set-cookie")).toBe(false);
  expect(await env.DB.prepare("SELECT count(*) AS n FROM used_tokens").first()).toEqual({ n: 0 });
  const html = await get.text();
  expect(html).toContain("&lt;img");
  expect(html).toContain('method="post"');
  expect(html).not.toContain("<img");
  const denied = await auth.handler(
    new Request(url, {
      method: "POST",
      headers: { origin: "https://sibling.example.com", "sec-fetch-site": "same-site" },
    }),
  );
  expect(denied.status).toBe(403);
  const confirmed = await auth.handler(
    new Request(url, { method: "POST", headers: { origin: env.PORTAL_URL } }),
  );
  expect(confirmed.status).toBe(302);
  expect(confirmed.headers.get("set-cookie")).toContain("session_token");
});
it("rejects old email collisions safely while preserving the standalone account's data", async () => {
  const auth = createAuth(),
    adapter = (await auth.$context).internalAdapter;
  const sub = "old-collision";
  const suffix = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sub)))
    .toString("hex")
    .slice(0, 32);
  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, 'Legacy', ?, 0, 0, 0)",
  )
    .bind(id, `host-${suffix}@users.feedbax.invalid`)
    .run();
  const resolved = await resolveHostUser(await verifyHostToken(await mintToken({ sub })), adapter);
  expect(resolved.id).not.toBe(id);
  expect(
    await env.DB.prepare("SELECT host_subject, name FROM user WHERE id = ?").bind(id).first(),
  ).toEqual({ host_subject: null, name: "Legacy" });
});
it("rejects public email changes into the internal namespace at the adapter hook", async () => {
  const auth = createAuth(),
    adapter = (await auth.$context).internalAdapter;
  const signup = await post(auth, "sign-up/email", {
    name: "Ada",
    email: "ada@example.com",
    password: "a long test password",
  });
  const user = (await auth.api.getSession({
    headers: new Headers({ cookie: signup.headers.get("set-cookie")!.split(";")[0] }),
  }))!.user;
  await expect(
    adapter.updateUser(user.id, { email: "squat@USERS.FEEDBAX.INVALID" }),
  ).rejects.toMatchObject({ status: "BAD_REQUEST" });
  expect(await env.DB.prepare("SELECT email FROM user WHERE id = ?").bind(user.id).first()).toEqual(
    { email: "ada@example.com" },
  );
});
