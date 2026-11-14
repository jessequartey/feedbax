// Controlled provider HTTP, never a mocked auth/session result. All state, cookies,
// callback processing, adapter writes and linking decisions run in Better Auth.
import { vi } from "vite-plus/test";
import { env } from "cloudflare:workers";
import type { createAuth } from "../../src/server/auth.ts";

export function githubTransport(profile = { id: 123, name: "Ada", email: "ada@example.com" }) {
  const transport = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin === "https://github.com" && url.pathname === "/login/oauth/access_token")
      return Response.json({
        access_token: "test-only-oauth-access",
        token_type: "bearer",
        scope: "read:user,user:email",
      });
    if (url.origin === "https://api.github.com" && url.pathname === "/user")
      return Response.json({ ...profile, login: "ada", avatar_url: null });
    if (url.origin === "https://api.github.com" && url.pathname === "/user/emails")
      return Response.json([{ email: profile.email, primary: true, verified: true }]);
    throw new Error("Unexpected provider transport");
  });
  vi.stubGlobal("fetch", transport);
  return transport;
}
export function cookieHeader(response: Response) {
  return response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
}
export async function startGithub(
  handler: (request: Request) => Promise<Response>,
  cookie = "",
  callbackURL = "/",
) {
  const response = await handler(
    new Request(`${env.PORTAL_URL}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { origin: env.PORTAL_URL, "content-type": "application/json", cookie },
      body: JSON.stringify({ provider: "github", callbackURL }),
    }),
  );
  if (response.status !== 200) throw new Error(`OAuth start status ${response.status}`);
  const authorization = new URL(((await response.json()) as { url: string }).url);
  return {
    cookie: [cookie, cookieHeader(response)].filter(Boolean).join("; "),
    authorization,
    callback: `${env.PORTAL_URL}/api/auth/callback/github?${new URLSearchParams({ state: authorization.searchParams.get("state")!, code: "test-only-code" })}`,
  };
}
export async function socialSession(auth: ReturnType<typeof createAuth>, cookie = "") {
  const start = await startGithub((request) => auth.handler(request), cookie);
  return auth.handler(new Request(start.callback, { headers: { cookie: start.cookie } }));
}
