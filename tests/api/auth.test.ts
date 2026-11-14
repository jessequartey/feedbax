import { beforeEach, expect, it } from "vite-plus/test";
import { env } from "cloudflare:workers";
import { resetEnv } from "../fixtures/cloudflare-workers.ts";
import { createAuth, publicConfig } from "../../src/server/auth.ts";
import { hashPassword, verifyPassword } from "../../src/server/password.ts";
import config from "../../feedbax.config.ts";

beforeEach(resetEnv);
it("round-trips PBKDF2, rejects wrong passwords, and uses stored iterations", async () => {
  const hash = await hashPassword("a long test password");
  expect(hash).toMatch(/^pbkdf2-sha256\$50000\$[\w-]{22}\$[\w-]{43}$/);
  expect(await verifyPassword({ hash, password: "a long test password" })).toBe(true);
  expect(await verifyPassword({ hash, password: "wrong password" })).toBe(false);
  // A hash made at a higher count (older install, or a later default) keeps verifying.
  const higher = await hashPassword("a long test password", 100_000);
  expect(higher).toContain("$100000$");
  expect(await verifyPassword({ hash: higher, password: "a long test password" })).toBe(true);
  expect(
    await verifyPassword({
      hash: hash.replace("50000", "999999999"),
      password: "a long test password",
    }),
  ).toBe(false);
});
it("verifies an independently derived 50k hash using the stored iteration count", async () => {
  // Node's pbkdf2Sync, SHA-256, salt bytes 00..0f, 50k iterations, 32 bytes.
  const hash =
    "pbkdf2-sha256$50000$AAECAwQFBgcICQoLDA0ODw$I-QvEajxwzl9U6ZoVPeV7kanQPAIrQgAcCqYVuyudD0";
  expect(await verifyPassword({ hash, password: "known long password" })).toBe(true);
  expect(
    await verifyPassword({
      hash: hash.replace("50000", "100000"),
      password: "known long password",
    }),
  ).toBe(false);
});

it("host confirmation creates a real session and sign-out revokes it", async () => {
  const { handleAuth } = await import("../../src/server/http.ts");
  const { mintToken } = await import("./helpers.ts");
  const url = `${env.PORTAL_URL}/api/auth/feedbax/sign-in?token=${await mintToken()}`;
  expect((await handleAuth(new Request(url))).status).toBe(200);
  const confirmation = await handleAuth(
    new Request(url, { method: "POST", headers: { origin: env.PORTAL_URL } }),
  );
  expect(confirmation.status).toBe(302);
  const cookie = confirmation.headers.get("set-cookie")!.split(";")[0];
  expect((await createAuth().api.getSession({ headers: new Headers({ cookie }) }))?.user.name).toBe(
    "Host user",
  );
  expect(
    (
      await handleAuth(
        new Request(`${env.PORTAL_URL}/api/auth/sign-out`, {
          method: "POST",
          headers: { origin: env.PORTAL_URL, cookie, "content-type": "application/json" },
          body: "{}",
        }),
      )
    ).status,
  ).toBe(200);
  expect(await createAuth().api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
});
it("exposes only complete OAuth providers and rejects half-configured pairs", () => {
  expect(publicConfig().oauth).toEqual({ github: false, google: false });
  expect(() =>
    publicConfig(config, { ...env, GITHUB_CLIENT_ID: " ", GITHUB_CLIENT_SECRET: "secret" }),
  ).toThrow(/GITHUB_CLIENT_ID/);
  expect(() => createAuth(config, { ...env, GOOGLE_CLIENT_ID: "test-id" })).toThrow(/GOOGLE/);
  expect(
    publicConfig(config, { ...env, GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" }).oauth
      .google,
  ).toBe(true);
});

it("rejects every non-portal auth route at the real mount without database work", async () => {
  const { handleAuth } = await import("../../src/server/http.ts");
  const { mintToken } = await import("./helpers.ts");
  const signedIn = await handleAuth(
    new Request(`${env.PORTAL_URL}/api/auth/feedbax/sign-in?token=${await mintToken()}`, {
      method: "POST",
      headers: { origin: env.PORTAL_URL },
    }),
  );
  const cookie = signedIn.headers.get("set-cookie")!.split(";")[0];
  const before = await env.DB.prepare("SELECT name FROM user").all();
  const { vi } = await import("vite-plus/test");
  const prepare = vi.spyOn(env.DB, "prepare");
  try {
    for (const path of [
      "sign-up/email",
      "sign-in/email",
      "request-password-reset",
      "reset-password",
      "reset-password/token",
      "verify-password",
      "set-password",
      "change-password",
      "change-email",
      "update-user",
      "update-session",
      "delete-user",
      "delete-user/callback",
      "delete-anonymous-user",
      "link-social",
      "unlink-account",
      "list-accounts",
      "get-access-token",
      "refresh-token",
      "account-info",
      "get-session",
      "list-sessions",
      "revoke-session",
      "revoke-sessions",
      "revoke-other-sessions",
      "send-verification-email",
      "verify-email",
      "ok",
      "sign-in/social/",
      "sign-in/%73ocial",
    ]) {
      for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]) {
        for (const sessionCookie of ["", cookie]) {
          const response = await handleAuth(
            new Request(`${env.PORTAL_URL}/api/auth/${path}`, {
              method,
              headers: {
                origin: env.PORTAL_URL,
                cookie: sessionCookie,
                "content-type": "application/json",
              },
              ...(method === "POST"
                ? {
                    body: JSON.stringify({
                      name: "Changed",
                      email: "new@example.com",
                      password: "a long test password",
                    }),
                  }
                : {}),
            }),
          );
          expect([404, 405], `${method} ${path}`).toContain(response.status);
          expect(response.headers.get("cache-control")).toBe("no-store");
          expect(response.headers.has("set-cookie")).toBe(false);
        }
      }
    }
    expect(prepare).not.toHaveBeenCalled();
  } finally {
    prepare.mockRestore();
  }
  expect(await env.DB.prepare("SELECT name FROM user").all()).toEqual(before);
});

it("projects only public capabilities, validates host keys and keeps host login distinct from appUrl", () => {
  const settings = { ...config, appUrl: "https://host.example.com" };
  expect(Object.keys(publicConfig(settings)).sort()).toEqual([
    "anonymous",
    "appUrl",
    "hostLogin",
    "name",
    "oauth",
  ]);
  expect(publicConfig(settings).hostLogin).toBe(true);
  expect(publicConfig(settings, { ...env, FEEDBAX_HOST_SECRET: "" }).hostLogin).toBe(false);
  expect(publicConfig({ ...settings, appUrl: null }).hostLogin).toBe(false);
  for (const secret of ["bad", env.FEEDBAX_HOST_SECRET + "=", "A".repeat(42) + "B"])
    expect(() => publicConfig(settings, { ...env, FEEDBAX_HOST_SECRET: secret })).toThrow(
      /FEEDBAX_HOST_SECRET/,
    );
});

it("skips auth construction and D1 for absent or unrelated viewer cookies", async () => {
  const { viewerUser } = await import("../../src/server/auth.ts");
  const { vi } = await import("vite-plus/test");
  const secret = env.BETTER_AUTH_SECRET;
  const prepare = vi.spyOn(env.DB, "prepare");
  env.BETTER_AUTH_SECRET = "invalid";
  try {
    for (const cookie of ["", "theme=dark; unrelated=value"])
      expect(await viewerUser(new Headers({ cookie }))).toBeNull();
    expect(prepare).not.toHaveBeenCalled();
    // Presence never authenticates: both local and Secure spellings still enter auth.
    for (const cookie of [
      "better-auth.session_token=forged",
      "__Secure-better-auth.session_token=forged",
      "better-auth-session_token=forged",
      "__Secure-better-auth-session_token=forged",
    ])
      await expect(viewerUser(new Headers({ cookie }))).rejects.toThrow(/BETTER_AUTH_SECRET/);
  } finally {
    env.BETTER_AUTH_SECRET = secret;
    prepare.mockRestore();
  }
});

it("checks each viewer session independently, observes expiry/logout and accepts Secure cookies", async () => {
  const { viewerUser } = await import("../../src/server/auth.ts");
  const { mintToken } = await import("./helpers.ts");
  const portal = "https://portal.example.com",
    bindings = { ...env, PORTAL_URL: portal };
  const auth = createAuth(config, bindings);
  const signin = async (sub: string) => {
    const response = await auth.handler(
      new Request(
        `${portal}/api/auth/feedbax/sign-in?token=${await mintToken({ sub, name: sub })}`,
        { method: "POST", headers: { origin: portal } },
      ),
    );
    expect(response.status).toBe(302);
    return response.headers.get("set-cookie")!.split(";")[0];
  };
  const one = await signin("One"),
    two = await signin("Two");
  expect(one).toContain("__Secure-better-auth.session_token=");
  const viewers = await Promise.all([
    viewerUser(new Headers({ cookie: one }), config, bindings),
    viewerUser(new Headers({ cookie: two }), config, bindings),
  ]);
  expect(viewers.map((v) => v?.name)).toEqual(["One", "Two"]);
  await env.DB.prepare("UPDATE session SET expires_at=0 WHERE user_id=?")
    .bind(viewers[0]!.id)
    .run();
  expect(await viewerUser(new Headers({ cookie: one }), config, bindings)).toBeNull();
  expect(await viewerUser(new Headers({ cookie: two }), config, bindings)).toMatchObject({
    name: "Two",
  });
  const logout = await auth.handler(
    new Request(`${portal}/api/auth/sign-out`, {
      method: "POST",
      headers: { origin: portal, cookie: two, "content-type": "application/json" },
      body: "{}",
    }),
  );
  expect(logout.status).toBe(200);
  expect(await viewerUser(new Headers({ cookie: two }), config, bindings)).toBeNull();
  expect(
    await viewerUser(
      new Headers({ cookie: "__Secure-better-auth.session_token=forged" }),
      config,
      bindings,
    ),
  ).toBeNull();
});
