import { beforeEach, describe, expect, it } from "vite-plus/test";
import { env } from "cloudflare:workers";
import { resetEnv } from "../fixtures/cloudflare-workers.ts";
import config from "../../feedbax.config.ts";
import {
  ADMIN_LINK_MAX_SKEW_SECONDS,
  ADMIN_LINK_TTL_SECONDS,
  mintAdminLink,
  verifyAdminToken,
} from "../../src/server/admin-link.ts";
import { ADMIN_HOME, SYNTHETIC_ADMIN_ID, consumeAdminNonce } from "../../src/server/admin.ts";
import { createAuth, requireAdmin, viewerUser } from "../../src/server/auth.ts";
import { handleAdminEnter, handleAuth } from "../../src/server/http.ts";
import { mintToken } from "./helpers.ts";
import { cookieHeader } from "./oauth-transport.ts";

beforeEach(resetEnv);
const secret = env.BETTER_AUTH_SECRET;
const NOW = 1_800_000_000;
const NONCE = "AAAAAAAAAAAAAAAAAAAAAA";

async function link(now?: number) {
  return mintAdminLink({ secret, portalUrl: env.PORTAL_URL, ...(now ? { now } : {}) });
}
const enter = (url: string, init: RequestInit = {}) => handleAdminEnter(new Request(url, init));
const post = (url: string, cookie?: string) =>
  enter(url, {
    method: "POST",
    headers: { origin: env.PORTAL_URL, ...(cookie ? { cookie } : {}) },
  });
async function hostCookie() {
  const url = `${env.PORTAL_URL}/api/auth/feedbax/sign-in?token=${await mintToken()}`;
  const response = await handleAuth(
    new Request(url, { method: "POST", headers: { origin: env.PORTAL_URL } }),
  );
  return response.headers.get("set-cookie")!.split(";")[0];
}

describe("admin link tokens", () => {
  it("mints a deterministic /admin/enter link with a 15-minute TTL", async () => {
    const minted = await mintAdminLink({
      secret,
      portalUrl: "https://feedback.example.com/",
      now: NOW,
      nonce: NONCE,
    });
    expect(ADMIN_LINK_TTL_SECONDS).toBe(900);
    expect(minted.expiresAt).toBe(NOW + 900);
    expect(minted.token).toMatch(new RegExp(`^${NONCE}\\.${NOW + 900}\\.[A-Za-z0-9_-]{43}$`));
    expect(minted.url).toBe(`https://feedback.example.com/admin/enter?t=${minted.token}`);
    expect(
      await mintAdminLink({ secret, portalUrl: env.PORTAL_URL, now: NOW, nonce: NONCE }),
    ).toMatchObject({ token: minted.token });
    expect(await verifyAdminToken(minted.token, secret, NOW)).toEqual({
      nonce: NONCE,
      exp: NOW + 900,
    });
  });
  it("uses fresh random nonces by default", async () => {
    const [a, b] = await Promise.all([link(), link()]);
    expect(a.token.split(".")[0]).not.toBe(b.token.split(".")[0]);
  });
  it("expires after 15 minutes", async () => {
    const { token } = await link(NOW);
    expect(await verifyAdminToken(token, secret, NOW + 899)).not.toBeNull();
    expect(await verifyAdminToken(token, secret, NOW + 900)).not.toBeNull();
    expect(await verifyAdminToken(token, secret, NOW + 901)).toBeNull();
  });
  it("tolerates a mint clock a few minutes ahead, but rejects far-future expiries", async () => {
    const ahead = await link(NOW + ADMIN_LINK_MAX_SKEW_SECONDS);
    expect(await verifyAdminToken(ahead.token, secret, NOW)).not.toBeNull();
    const tooFar = await link(NOW + ADMIN_LINK_MAX_SKEW_SECONDS + 1);
    expect(await verifyAdminToken(tooFar.token, secret, NOW)).toBeNull();
  });
  it("rejects tampering, other secrets and malformed tokens", async () => {
    const { token } = await link(NOW);
    const [nonce, exp, sig] = token.split(".");
    const flip = (s: string, i = 0) => s.slice(0, i) + (s[i] === "A" ? "B" : "A") + s.slice(i + 1);
    for (const bad of [
      `${flip(nonce)}.${exp}.${sig}`,
      `${nonce}.${Number(exp) + 60}.${sig}`, // extend the expiry
      `${nonce}.${exp}.${flip(sig)}`,
      `${nonce}.${exp}.${sig.slice(0, -1)}${sig.at(-1) === "A" ? "B" : "A"}`,
      `${nonce}.${exp}`,
      `${nonce}.${exp}.${sig}.x`,
      `${nonce}.0${exp}.${sig}`,
      ` ${token}`,
      "",
    ])
      expect(await verifyAdminToken(bad, secret, NOW), bad).toBeNull();
    expect(await verifyAdminToken(undefined, secret, NOW)).toBeNull();
    expect(await verifyAdminToken(token, `${secret}-other`, NOW)).toBeNull();
    // A Better Auth cookie signature with the same secret is not an admin signature.
    const raw = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const direct = Buffer.from(
      await crypto.subtle.sign("HMAC", raw, new TextEncoder().encode(`${nonce}.${exp}`)),
    ).toString("base64url");
    expect(await verifyAdminToken(`${nonce}.${exp}.${direct}`, secret, NOW)).toBeNull();
  });
  it("refuses to mint or verify with a missing or short secret", async () => {
    await expect(mintAdminLink({ secret: "short", portalUrl: env.PORTAL_URL })).rejects.toThrow(
      "BETTER_AUTH_SECRET",
    );
    await expect(verifyAdminToken("x", "")).rejects.toThrow("BETTER_AUTH_SECRET");
  });
});

describe("admin nonce consumption", () => {
  it("consumes a nonce exactly once, including simultaneous arrivals", async () => {
    const claims = (await verifyAdminToken((await link()).token, secret))!;
    const results = await Promise.allSettled([
      consumeAdminNonce(claims),
      consumeAdminNonce(claims),
      consumeAdminNonce(claims),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(consumeAdminNonce(claims)).rejects.toMatchObject({ code: "unauthenticated" });
  });
  it("keeps the marker past expiry plus skew, then prunes it on a later use", async () => {
    const claims = { nonce: NONCE, exp: NOW };
    await consumeAdminNonce(claims, env.DB, NOW * 1000);
    const row = await env.DB.prepare("SELECT expires_at FROM admin_link_nonces").first<{
      expires_at: number;
    }>();
    expect(row!.expires_at).toBe((NOW + ADMIN_LINK_MAX_SKEW_SECONDS) * 1000);
    await consumeAdminNonce(
      { nonce: "BBBBBBBBBBBBBBBBBBBBBB", exp: NOW + 10_000 },
      env.DB,
      (NOW + ADMIN_LINK_MAX_SKEW_SECONDS + 1) * 1000,
    );
    const left = await env.DB.prepare("SELECT nonce FROM admin_link_nonces").all();
    expect(left.results).toEqual([{ nonce: "BBBBBBBBBBBBBBBBBBBBBB" }]);
  });
});

describe("/admin/enter", () => {
  it("confirms on GET without consuming, then signs in the synthetic admin once on POST", async () => {
    const { url } = await link();
    const page = await enter(url);
    expect(page.status).toBe(200);
    expect(page.headers.get("cache-control")).toBe("no-store");
    expect(page.headers.get("referrer-policy")).toBe("strict-origin");
    const html = await page.text();
    expect(html).toContain('method="post"');
    expect(html).toContain(`action="/admin/enter?t=`);
    expect(await env.DB.prepare("SELECT * FROM admin_link_nonces").all()).toMatchObject({
      results: [],
    });
    expect((await enter(url)).status).toBe(200); // a prefetch does not burn the link

    const signedIn = await post(url);
    expect(signedIn.status).toBe(302);
    expect(signedIn.headers.get("location")).toBe(ADMIN_HOME);
    const cookie = cookieHeader(signedIn);
    const viewer = await viewerUser(new Headers({ cookie }));
    expect(viewer).toEqual({ id: SYNTHETIC_ADMIN_ID, name: "Admin", kind: "account", admin: true });
    expect(requireAdmin(viewer).id).toBe(SYNTHETIC_ADMIN_ID);

    // Replay: the same link is dead for GET and POST, and no extra session is created.
    expect((await enter(url)).status).toBe(401);
    const replay = await post(url);
    expect(replay.status).toBe(401);
    expect(replay.headers.get("set-cookie")).toBeNull();
    const sessions = await env.DB.prepare("SELECT count(*) AS n FROM session WHERE user_id = ?")
      .bind(SYNTHETIC_ADMIN_ID)
      .first<{ n: number }>();
    expect(sessions!.n).toBe(1);
  });
  it("reuses the one synthetic admin user across links", async () => {
    await post((await link()).url);
    await post((await link()).url);
    const users = await env.DB.prepare("SELECT id, role FROM user").all();
    expect(users.results).toEqual([{ id: SYNTHETIC_ADMIN_ID, role: "admin" }]);
  });
  it("promotes a signed-in user instead of creating a synthetic admin, and lifts a ban", async () => {
    const cookie = await hostCookie();
    const before = (await viewerUser(new Headers({ cookie })))!;
    expect(before.admin).toBeUndefined();
    await env.DB.prepare("UPDATE user SET banned_at = 1 WHERE id = ?").bind(before.id).run();
    const { url } = await link();
    expect(await (await enter(url, { headers: { cookie } })).text()).toContain(
      "Make <strong>Host user</strong> an admin",
    );
    const response = await post(url, cookie);
    expect(response.status).toBe(302);
    expect(response.headers.get("set-cookie")).toBeNull(); // the existing session is kept
    expect(await viewerUser(new Headers({ cookie }))).toEqual({ ...before, admin: true });
    expect(
      await env.DB.prepare("SELECT count(*) AS n FROM user WHERE id = ?")
        .bind(SYNTHETIC_ADMIN_ID)
        .first("n"),
    ).toBe(0);
  });
  it("never promotes an anonymous session", async () => {
    const enabled = { ...config, auth: { anonymous: true } };
    const auth = createAuth(enabled);
    const anonymous = cookieHeader(
      await auth.handler(
        new Request(`${env.PORTAL_URL}/api/auth/sign-in/anonymous`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: env.PORTAL_URL,
            "cf-connecting-ip": "192.0.2.3",
          },
          body: "{}",
        }),
      ),
    );
    const anonymousId = (await viewerUser(new Headers({ cookie: anonymous }), enabled))!.id;
    const { token } = await link();
    const response = await auth.handler(
      new Request(`${env.PORTAL_URL}/api/auth/feedbax/admin-enter?t=${token}`, {
        method: "POST",
        headers: { origin: env.PORTAL_URL, cookie: anonymous },
      }),
    );
    expect(response.status).toBe(302);
    expect((await viewerUser(new Headers({ cookie: cookieHeader(response) }), enabled))?.id).toBe(
      SYNTHETIC_ADMIN_ID,
    );
    expect(
      await env.DB.prepare("SELECT role FROM user WHERE id = ?").bind(anonymousId).first("role"),
    ).toBe("user");
  });
  it("rejects cross-origin POSTs without consuming the link", async () => {
    const { url } = await link();
    const forged = await enter(url, {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });
    expect(forged.status).toBe(403);
    expect(forged.headers.get("set-cookie")).toBeNull();
    expect((await post(url)).status).toBe(302);
  });
  it("rejects expired and tampered links", async () => {
    const expired = await link(Math.floor(Date.now() / 1000) - 901);
    expect((await enter(expired.url)).status).toBe(401);
    expect((await post(expired.url)).status).toBe(401);
    const { url } = await link();
    const tampered = url.replace(/\.(\d+)\./, (_, exp) => `.${Number(exp) + 1}.`);
    const response = await post(tampered);
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain(new URL(url).searchParams.get("t")!.split(".")[0]);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM user").first("n")).toBe(0);
  });
  it("only allows GET and POST", async () => {
    const response = await enter((await link()).url, { method: "PUT" });
    expect(response.status).toBe(405);
  });
  it("is not reachable through the general /api/auth allowlist", async () => {
    const { token } = await link();
    const response = await handleAuth(
      new Request(`${env.PORTAL_URL}/api/auth/feedbax/admin-enter?t=${token}`),
    );
    expect(response.status).toBe(404);
  });
});

describe("requireAdmin", () => {
  const base = { id: "u", name: "U", kind: "account" as const };
  it("requires a signed-in, unbanned, non-anonymous admin", () => {
    expect(() => requireAdmin(null)).toThrow(expect.objectContaining({ code: "unauthenticated" }));
    expect(() => requireAdmin(base)).toThrow(expect.objectContaining({ code: "forbidden" }));
    expect(() => requireAdmin({ ...base, admin: true, banned: true })).toThrow(
      expect.objectContaining({ code: "forbidden" }),
    );
    expect(() => requireAdmin({ ...base, kind: "anonymous", admin: true })).toThrow(
      expect.objectContaining({ code: "forbidden" }),
    );
    expect(requireAdmin({ ...base, admin: true })).toEqual({ ...base, admin: true });
  });
  it("revokes immediately when the role is removed in D1", async () => {
    const cookie = cookieHeader(await post((await link()).url));
    expect(requireAdmin(await viewerUser(new Headers({ cookie })))).toBeTruthy();
    await env.DB.prepare("UPDATE user SET role = 'user' WHERE id = ?")
      .bind(SYNTHETIC_ADMIN_ID)
      .run();
    const viewer = await viewerUser(new Headers({ cookie }));
    expect(() => requireAdmin(viewer)).toThrow(expect.objectContaining({ code: "forbidden" }));
  });
});
