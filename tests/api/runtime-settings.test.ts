import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { env } from "cloudflare:workers";
import { resetEnv } from "../fixtures/cloudflare-workers.ts";
import config from "../../feedbax.config.ts";
import { adminApi } from "../../src/server/admin-api.ts";
import { createAuth, viewerUser } from "../../src/server/auth.ts";
import { handleAuth } from "../../src/server/http.ts";
import { createPostForUser } from "../../src/server/posts.ts";
import { portalConfig } from "../../src/server/portal-config.ts";
import { SETTINGS_TTL_MS } from "../../src/server/settings-cache.ts";
import { effectiveSettings, runtimeConfig } from "../../src/server/settings.ts";
import { form, writer } from "./helpers.ts";
import { cookieHeader } from "./oauth-transport.ts";

beforeEach(resetEnv);
afterEach(() => vi.restoreAllMocks());
const actor = async () => {
  const user = await writer();
  await env.DB.prepare("UPDATE user SET role = 'admin' WHERE id = ?").bind(user.id).run();
  return { ...user, admin: true as const };
};
const anonymousSignIn = () =>
  handleAuth(
    new Request(`${env.PORTAL_URL}/api/auth/sign-in/anonymous`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: env.PORTAL_URL,
        "cf-connecting-ip": "192.0.2.9",
      },
      body: "{}",
    }),
  );

it("shows the settings the admin saved in the public config, and the project defaults otherwise", async () => {
  expect(await portalConfig()).toMatchObject({
    name: config.name,
    anonymous: config.auth.anonymous,
    categories: ["feature", "bug", "general"],
  });
  await adminApi.saveSettings(await actor(), {
    name: "Acme Feedback",
    anonymous: true,
    categories: ["bug", "general"],
  });
  expect(await portalConfig()).toMatchObject({
    name: "Acme Feedback",
    anonymous: true,
    categories: ["bug", "general"],
  });
  // Secrets and integrations are not part of what the page can read or change.
  expect(Object.keys(await portalConfig()).sort()).toEqual([
    "anonymous",
    "appUrl",
    "categories",
    "email",
    "hostLogin",
    "name",
    "oauth",
    "showcase",
  ]);
  await expect(
    adminApi.saveSettings(await actor(), { BETTER_AUTH_SECRET: "x" }),
  ).rejects.toMatchObject({
    code: "invalid_input",
  });
  await expect(adminApi.saveSettings(await actor(), { name: "  padded " })).rejects.toMatchObject({
    code: "invalid_input",
    field: "name",
  });
  expect((await adminApi.getSettings(await actor(), undefined)).defaults.name).toBe(config.name);
});
it("switches anonymous sign-in on and off per request without ending existing sessions", async () => {
  const admin = await actor();
  // Config says off: no anonymous sessions.
  expect(config.auth.anonymous).toBe(false);
  expect((await anonymousSignIn()).status).toBe(404);

  await adminApi.saveSettings(admin, { anonymous: true });
  const response = await anonymousSignIn();
  expect(response.status).toBe(200);
  const headers = new Headers({ cookie: cookieHeader(response) });
  const visitor = (await viewerUser(headers))!;
  expect(visitor.kind).toBe("anonymous");
  // The override also reaches the write guard: no per-call config is passed.
  await expect(createPostForUser(form(), visitor)).resolves.toMatchObject({ status: 201 });

  await adminApi.saveSettings(admin, { anonymous: false });
  expect((await anonymousSignIn()).status).toBe(404);
  // The existing session still resolves (reads keep working) but can no longer write.
  expect((await viewerUser(headers))!.id).toBe(visitor.id);
  await expect(createPostForUser(form(), visitor)).rejects.toMatchObject({ code: "forbidden" });

  // Clearing the override falls back to feedbax.config.ts.
  await adminApi.saveSettings(admin, { anonymous: true });
  await adminApi.saveSettings(admin, { anonymous: null });
  expect((await anonymousSignIn()).status).toBe(404);
});
it("mounts Better Auth's anonymous plugin from the effective config", async () => {
  await adminApi.saveSettings(await actor(), { anonymous: true });
  const request = () =>
    new Request(`${env.PORTAL_URL}/api/auth/sign-in/anonymous`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: env.PORTAL_URL },
      body: "{}",
    });
  expect((await createAuth(await runtimeConfig()).handler(request())).status).toBe(200);
  expect((await createAuth().handler(request())).status).toBe(404); // config alone: off
});
it("reads D1 once per isolate per TTL, not once per request", async () => {
  let reads = 0;
  const counting = new Proxy(env.DB, {
    get(target, key) {
      if (key === "prepare")
        return (query: string) => {
          if (query.includes('from "settings"')) reads += 1;
          return target.prepare(query);
        };
      const value = Reflect.get(target, key) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const t0 = 1_000_000;
  const first = await effectiveSettings(counting, config, t0);
  await effectiveSettings(counting, config, t0 + 1);
  await Promise.all([1, 2, 3].map(() => effectiveSettings(counting, config, t0 + 500)));
  expect(reads).toBe(1);
  expect(first.name).toBe(config.name);
  await effectiveSettings(counting, config, t0 + SETTINGS_TTL_MS + 1);
  expect(reads).toBe(2);
});
it("a save is visible to the next request in the same isolate, before the TTL runs out", async () => {
  expect((await effectiveSettings()).name).toBe(config.name);
  await adminApi.saveSettings(await actor(), { name: "Renamed" });
  expect((await effectiveSettings()).name).toBe("Renamed");
});
it("keeps the portal on feedbax.config.ts if the settings read fails", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const broken = new Proxy(env.DB, {
    get(target, key) {
      if (key === "prepare")
        return () => {
          throw new Error("D1 unavailable");
        };
      const value = Reflect.get(target, key) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  expect(await runtimeConfig(config, broken)).toEqual(config);
});
