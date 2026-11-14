import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { env } from "cloudflare:workers";
import { resetEnv } from "../fixtures/cloudflare-workers.ts";
import { handleAuth } from "../../src/server/http.ts";
import { createAuth } from "../../src/server/auth.ts";
import { authClient } from "../../src/lib/auth-client.ts";
import config from "../../feedbax.config.ts";

// The portal's thin fetch facade against the real Better Auth mount: every path, body and
// response shape the portal relies on.
let cookie = "";
beforeEach(() => {
  resetEnv();
  cookie = "";
  vi.stubGlobal("fetch", async (path: string, init: RequestInit) => {
    const response = await handleAuth(
      new Request(new URL(path, env.PORTAL_URL), {
        ...init,
        headers: {
          ...(init.headers as Record<string, string>),
          origin: env.PORTAL_URL,
          "cf-connecting-ip": "192.0.2.7",
          ...(cookie ? { cookie } : {}),
        },
      }),
    );
    const set = response.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return response;
  });
});
afterEach(() => vi.unstubAllGlobals());

it("signs up, signs out and signs in through the facade", async () => {
  const credentials = { email: "ada@example.com", password: "a long test password" };
  const up = await authClient.signUp.email({ name: "Ada", ...credentials });
  expect(up.error).toBeNull();
  expect(cookie).toContain("better-auth.session_token=");
  expect(
    (await createAuth().api.getSession({ headers: new Headers({ cookie }) }))?.user.name,
  ).toBe("Ada");
  expect((await authClient.signOut()).error).toBeNull();
  expect(await createAuth().api.getSession({ headers: new Headers({ cookie }) })).toBeNull();
  cookie = "";
  const bad = await authClient.signIn.email({ ...credentials, password: "wrong password!!" });
  expect(bad.data).toBeNull();
  expect(bad.error).toMatchObject({ status: 401, code: "INVALID_EMAIL_OR_PASSWORD" });
  expect((await authClient.signIn.email(credentials)).error).toBeNull();
  expect(cookie).toContain("better-auth.session_token=");
});

it("returns a redirect URL for social sign-in when a provider is configured", async () => {
  Object.assign(env, { GITHUB_CLIENT_ID: "client", GITHUB_CLIENT_SECRET: "secret" });
  const assign = vi.fn();
  vi.stubGlobal("window", { location: { assign } });
  const result = await authClient.signIn.social({ provider: "github", callbackURL: "/" });
  expect(result.error).toBeNull();
  expect(assign).toHaveBeenCalledOnce();
  expect(new URL(assign.mock.calls[0][0]).hostname).toBe("github.com");
});

it("serves anonymous sign-in only when the config enables it", async () => {
  // Disabled by default: the endpoint does not exist (the portal never calls it then).
  expect(config.auth.anonymous).toBe(false);
  expect((await authClient.signIn.anonymous()).error?.status).toBe(404);
});
