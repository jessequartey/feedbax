import { beforeEach, expect, it, vi } from "vite-plus/test";
import { env } from "cloudflare:workers";
import { resetEnv } from "../fixtures/cloudflare-workers.ts";
import { createAuth } from "../../src/server/auth.ts";
import { verifyHostToken, resolveHostUser } from "../../src/server/host-token.ts";
import { mintFeedbaxToken } from "../../registry/feedbax-feedback/lib/token.server.ts";
import { mintToken } from "./helpers.ts";

beforeEach(resetEnv);
it("validates social names and reserved emails at internal adapter hooks", async () => {
  const adapter = (await createAuth().$context).internalAdapter;
  for (const name of ["", "   ", "x".repeat(81)])
    await expect(
      adapter.createUser(
        { name, email: "ada@example.com", emailVerified: false },
        { method: "test" },
      ),
    ).rejects.toMatchObject({ status: "BAD_REQUEST" });
  for (const email of ["host-x@users.feedbax.invalid", "HOST-X@USERS.FEEDBAX.INVALID"])
    await expect(
      adapter.createUser({ name: "Ada", email, emailVerified: false }, { method: "test" }),
    ).rejects.toMatchObject({ status: "BAD_REQUEST" });
  const user = await adapter.createUser(
    { name: "Ada", email: "ada@example.com", emailVerified: false },
    { method: "test" },
  );
  await expect(adapter.updateUser(user.id, { name: "   " })).rejects.toMatchObject({
    status: "BAD_REQUEST",
  });
  await adapter.updateUser(user.id, { name: "🦊".repeat(80) });
});
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
it("keeps native confirmation form origins usable without exposing token query referrers", async () => {
  const auth = createAuth();
  const url = `${env.PORTAL_URL}/api/auth/feedbax/sign-in?token=${await mintToken()}`;
  const confirmation = await auth.handler(new Request(url));
  expect(confirmation.headers.get("referrer-policy")).toBe("strict-origin");
  expect(await confirmation.text()).toContain('<meta name="referrer" content="strict-origin">');
  const invalid = await auth.handler(
    new Request(`${env.PORTAL_URL}/api/auth/feedbax/sign-in?token=invalid`),
  );
  expect(invalid.headers.get("referrer-policy")).toBe("no-referrer");
  const accepted = await auth.handler(
    new Request(url, { method: "POST", headers: { origin: env.PORTAL_URL } }),
  );
  expect(accepted.status).toBe(302);
  expect(accepted.headers.get("referrer-policy")).toBe("no-referrer");
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
  const user = await adapter.createUser(
    { name: "Ada", email: "ada@example.com", emailVerified: false },
    { method: "test" },
  );
  await expect(
    adapter.updateUser(user.id, { email: "squat@USERS.FEEDBAX.INVALID" }),
  ).rejects.toMatchObject({ status: "BAD_REQUEST" });
  expect(await env.DB.prepare("SELECT email FROM user WHERE id = ?").bind(user.id).first()).toEqual(
    { email: "ada@example.com" },
  );
});

it("runs mounted social start/callback with provider HTTP and preserves OAuth state, logout and replay isolation", async () => {
  const { handleAuth } = await import("../../src/server/http.ts");
  const { githubTransport, startGithub, cookieHeader } = await import("./oauth-transport.ts");
  Object.assign(env, { GITHUB_CLIENT_ID: "client", GITHUB_CLIENT_SECRET: "secret" });
  const transport = githubTransport();
  try {
    const start = await startGithub(handleAuth, "", "/my-feedback");
    expect(start.authorization.searchParams.get("redirect_uri")).toBe(
      `${env.PORTAL_URL}/api/auth/callback/github`,
    );
    const wrong = new URL(start.callback);
    wrong.searchParams.set("state", "mismatch");
    const mismatch = await handleAuth(new Request(wrong, { headers: { cookie: start.cookie } }));
    expect(mismatch.status).toBe(302);
    expect(mismatch.headers.get("location")).toContain("error=");
    expect(transport).not.toHaveBeenCalled();
    const response = await handleAuth(
      new Request(start.callback, {
        headers: { cookie: start.cookie, "sec-fetch-site": "cross-site" },
      }),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/my-feedback");
    const cookie = cookieHeader(response);
    const session = await createAuth().api.getSession({ headers: new Headers({ cookie }) });
    expect(session?.user.name).toBe("Ada");
    expect(transport).toHaveBeenCalledTimes(3);
    const replay = await handleAuth(
      new Request(start.callback, { headers: { cookie: start.cookie } }),
    );
    expect(replay.headers.get("location")).toContain("error=");
    expect(transport).toHaveBeenCalledTimes(3);
    const cancel = await startGithub(handleAuth);
    const cancelled = new URL(cancel.callback);
    cancelled.searchParams.delete("code");
    cancelled.searchParams.set("error", "access_denied");
    expect(
      (
        await handleAuth(new Request(cancelled, { headers: { cookie: cancel.cookie } }))
      ).headers.get("location"),
    ).toContain("access_denied");
    for (const callbackURL of ["https://evil.example/", "//evil.example/"]) {
      await env.DB.prepare("DELETE FROM rate_limit").run();
      const invalid = await handleAuth(
        new Request(`${env.PORTAL_URL}/api/auth/sign-in/social`, {
          method: "POST",
          headers: { origin: env.PORTAL_URL, "content-type": "application/json" },
          body: JSON.stringify({ provider: "github", callbackURL }),
        }),
      );
      expect(invalid.status).toBe(403);
    }
    expect(
      (await handleAuth(new Request(`${env.PORTAL_URL}/api/auth/callback/google?state=invalid`)))
        .status,
    ).toBe(404);
    await env.DB.prepare("DELETE FROM rate_limit").run();
    const unconfigured = await handleAuth(
      new Request(`${env.PORTAL_URL}/api/auth/sign-in/social`, {
        method: "POST",
        headers: { origin: env.PORTAL_URL, "content-type": "application/json" },
        body: JSON.stringify({ provider: "google", callbackURL: "/" }),
      }),
    );
    expect(unconfigured.status).toBeGreaterThanOrEqual(400);
    await handleAuth(
      new Request(`${env.PORTAL_URL}/api/auth/sign-out`, {
        method: "POST",
        headers: { origin: env.PORTAL_URL, cookie, "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(await createAuth().api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
  } finally {
    vi.unstubAllGlobals();
    delete env.GITHUB_CLIENT_ID;
    delete env.GITHUB_CLIENT_SECRET;
  }
});
it("never links a new social subject to a legacy account with the same email", async () => {
  const { handleAuth } = await import("../../src/server/http.ts");
  const { githubTransport, startGithub } = await import("./oauth-transport.ts");
  const adapter = (await createAuth().$context).internalAdapter;
  const legacy = await adapter.createUser(
    { name: "Legacy", email: "ada@example.com", emailVerified: true },
    { method: "test" },
  );
  await env.DB.prepare(
    "INSERT INTO account (id,account_id,provider_id,user_id,password,updated_at) VALUES ('legacy','legacy','credential',?,'preserved-legacy-hash',0)",
  )
    .bind(legacy.id)
    .run();
  Object.assign(env, { GITHUB_CLIENT_ID: "client", GITHUB_CLIENT_SECRET: "secret" });
  githubTransport();
  try {
    const start = await startGithub(handleAuth);
    const response = await handleAuth(
      new Request(start.callback, { headers: { cookie: start.cookie } }),
    );
    expect(response.headers.get("location")).toContain("error=");
    expect(response.headers.getSetCookie().some((c) => c.includes("session_token="))).toBe(false);
    expect(await env.DB.prepare("SELECT name FROM user").all()).toMatchObject({
      results: [{ name: "Legacy" }],
    });
    expect(await env.DB.prepare("SELECT provider_id,password FROM account").all()).toMatchObject({
      results: [{ provider_id: "credential", password: "preserved-legacy-hash" }],
    });
    expect(await env.DB.prepare("SELECT count(*) AS n FROM session").first()).toEqual({ n: 0 });
  } finally {
    vi.unstubAllGlobals();
    delete env.GITHUB_CLIENT_ID;
    delete env.GITHUB_CLIENT_SECRET;
  }
});
