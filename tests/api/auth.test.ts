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

it("signs up, signs out, and signs in with a real session cookie", async () => {
  const auth = createAuth();
  const request = (path: string, body: unknown, cookie?: string) =>
    auth.handler(
      new Request(`${env.PORTAL_URL}/api/auth/${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: env.PORTAL_URL,
          "cf-connecting-ip": "192.0.2.1",
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify(body),
      }),
    );
  const signup = await request("sign-up/email", {
    email: "ada@example.com",
    password: "a long test password",
    name: "Ada",
  });
  expect(signup.status).toBe(200);
  const cookie = signup.headers.get("set-cookie")!.split(";")[0];
  expect(cookie).toContain("better-auth.session_token=");
  const stored = await env.DB.prepare("SELECT password FROM account").first<{ password: string }>();
  expect(stored!.password).toMatch(/^pbkdf2-sha256\$50000\$/);
  expect((await auth.api.getSession({ headers: new Headers({ cookie }) }))?.user.name).toBe("Ada");
  expect((await request("sign-out", {}, cookie)).status).toBe(200);
  expect(await auth.api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
  expect(
    (await request("sign-in/email", { email: "ada@example.com", password: "bad password" })).status,
  ).toBe(401);
  expect(
    (
      await request("sign-in/email", { email: "ada@example.com", password: "a long test password" })
    ).headers.get("set-cookie"),
  ).toContain("session_token");
});
it("exposes only complete OAuth providers and rejects half-configured pairs", () => {
  expect(publicConfig().oauth).toEqual({ github: false, google: false });
  expect(() => createAuth(config, { ...env, GOOGLE_CLIENT_ID: "test-id" })).toThrow(/GOOGLE/);
  expect(
    publicConfig(config, { ...env, GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" }).oauth
      .google,
  ).toBe(true);
});
