import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fromCrossJSON } from "seroval";
import { CliError } from "./flags.ts";
import type { Secrets, SetupAnswers } from "./types.ts";

// Use the application's emitted RPC ID; there is no probe endpoint or invented public API.
export async function viewerRpcId(cwd: string): Promise<string> {
  const assets = join(cwd, "dist/server/assets");
  for (const name of await readdir(assets)) {
    if (!/^functions-.*\.js$/.test(name)) continue;
    const source = await readFile(join(assets, name), "utf8");
    const id =
      /\bgetViewer_createServerFn_handler\s*=\s*createServerRpc\(\{\s*id:\s*["']([^"']+)["']/.exec(
        source,
      )?.[1];
    if (id) return id;
  }
  throw new CliError(
    "Could not find getViewer in the built app. Rebuild with the bundled toolchain before retrying.",
  );
}
export async function verifyDeployment(
  cwd: string,
  portal: string,
  answers: SetupAnswers,
  secrets: Secrets,
  fetchFn: typeof fetch,
): Promise<void> {
  const request = (path: string, init?: RequestInit) =>
    fetchFn(`${portal}${path}`, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
  const failed = () =>
    new CliError(
      "The deployed login wiring could not be verified. Check the production URL, provider credentials and deployment, then retry. No OAuth exchange or host integration has been verified.",
    );
  const health = await request("/api/health");
  if (!health.ok || ((await health.json()) as { ok?: boolean }).ok !== true) throw failed();
  const viewer = await request(`/_serverFn/${await viewerRpcId(cwd)}`, {
    headers: { accept: "application/json", "x-tsr-serverfn": "true", origin: portal },
  });
  if (!viewer.ok || !viewer.headers.get("content-type")?.includes("application/json"))
    throw failed();
  // getViewer contains only JSON-safe public primitives; no plugin or session is needed.
  const result = fromCrossJSON(await viewer.json(), {}) as {
    result?: {
      user: unknown;
      config: { oauth?: Record<string, boolean>; hostLogin?: boolean; appUrl?: string | null };
    };
    error?: unknown;
  };
  const publicViewer = result.result;
  if (result.error || !publicViewer || publicViewer.user !== null) throw failed();
  const config = publicViewer.config;
  if (!answers.login) return;
  if (answers.login === "host") {
    if (!config.hostLogin || config.appUrl !== answers.appUrl) throw failed();
    return;
  }
  if (!config.oauth?.[answers.login]) throw failed();
  // A fresh cookie jar, isolated from any user session. Do not follow the provider URL.
  const cookies = new Map<string, string>();
  const start = await request("/api/auth/sign-in/social", {
    method: "POST",
    headers: {
      origin: portal,
      "content-type": "application/json",
      cookie: [...cookies.values()].join("; "),
    },
    body: JSON.stringify({ provider: answers.login, callbackURL: "/", disableRedirect: true }),
  });
  for (const cookie of start.headers.getSetCookie()) {
    const value = cookie.split(";", 1)[0]!;
    cookies.set(value.split("=", 1)[0]!, value);
  }
  if (!start.ok) throw failed();
  const body = (await start.json()) as { url?: string };
  let url: URL;
  try {
    url = new URL(body.url ?? "");
  } catch {
    throw failed();
  }
  const allowed =
    answers.login === "github"
      ? url.origin === "https://github.com" && url.pathname === "/login/oauth/authorize"
      : url.origin === "https://accounts.google.com" &&
        ["/o/oauth2/v2/auth", "/o/oauth2/auth"].includes(url.pathname);
  const clientId = answers.login === "github" ? secrets.githubClientId : secrets.googleClientId;
  if (
    !allowed ||
    !cookies.size ||
    !url.searchParams.get("state") ||
    url.searchParams.get("client_id") !== clientId ||
    url.searchParams.get("redirect_uri") !== `${portal}/api/auth/callback/${answers.login}`
  )
    throw failed();
}
