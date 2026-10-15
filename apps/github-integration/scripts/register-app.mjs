import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const directory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const origin = process.argv[2];
if (
  !origin ||
  !origin.startsWith("https://") ||
  new URL(origin).origin !== origin
)
  throw new Error(
    "Usage: node scripts/register-app.mjs <service-https-origin> [--public]",
  );
try {
  const saved = JSON.parse(
    await readFile(resolve(directory, ".secrets.json"), "utf8"),
  );
  if (saved.GITHUB_APP_ID)
    throw new Error(
      "An App is already registered locally. Use its saved registration or explicitly prepare a separate service directory.",
    );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const state = randomBytes(32).toString("base64url");
const port = 8765;
const manifest = {
  name: "Feedbax",
  url: "https://feedbax.dev",
  description: "GitHub-backed feedback for Feedbax Core portals.",
  public: process.argv.includes("--public"),
  hook_attributes: { url: `${origin}/webhooks/github`, active: true },
  redirect_url: `http://127.0.0.1:${port}/callback`,
  callback_urls: [`${origin}/callback`],
  default_permissions: { issues: "write", metadata: "read" },
  default_events: ["issues", "issue_comment"],
  request_oauth_on_install: false,
};
const escape = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
let consumed = false;
const server = createServer(async (request, response) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  if (
    request.headers.host !== `127.0.0.1:${port}` ||
    request.method !== "GET"
  ) {
    response.writeHead(403).end();
    return;
  }
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  if (url.pathname === "/") {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(
      `<!doctype html><html lang="en"><meta charset="utf-8"><title>Register Feedbax</title><body><h1>Register the Feedbax GitHub App</h1><p>GitHub will ask you to choose the App name. Credentials are saved directly to the local ignored secret store and never displayed here.</p><form method="post" action="https://github.com/settings/apps/new?state=${state}"><input type="hidden" name="manifest" value="${escape(JSON.stringify(manifest))}"><button type="submit">Continue to GitHub</button></form></body></html>`,
    );
    return;
  }
  if (
    url.pathname !== "/callback" ||
    consumed ||
    url.searchParams.get("state") !== state ||
    !/^[a-zA-Z0-9_-]{10,256}$/.test(url.searchParams.get("code") ?? "")
  ) {
    response.writeHead(400).end("Invalid or expired registration.");
    return;
  }
  consumed = true;
  try {
    const converted = await fetch(
      `https://api.github.com/app-manifests/${encodeURIComponent(url.searchParams.get("code"))}/conversions`,
      {
        method: "POST",
        redirect: "manual",
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "Feedbax",
          "X-GitHub-Api-Version": "2026-03-10",
        },
      },
    );
    if (!converted.ok) throw new Error("Manifest exchange failed.");
    const app = await converted.json();
    if (
      !app.id ||
      !app.pem ||
      !app.webhook_secret ||
      !app.client_id ||
      !app.client_secret ||
      !/^[a-zA-Z0-9-]+$/.test(app.slug)
    )
      throw new Error("App registration response is incomplete.");
    const path = resolve(directory, ".secrets.json");
    let existing = {};
    try {
      existing = JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (existing.GITHUB_APP_ID)
      throw new Error(
        "App credentials already exist. Preserve or rotate them explicitly before registering another App.",
      );
    const secrets = {
      ...existing,
      GITHUB_APP_ID: String(app.id),
      GITHUB_CLIENT_ID: app.client_id,
      GITHUB_CLIENT_SECRET: app.client_secret,
      GITHUB_APP_PRIVATE_KEY: app.pem,
      GITHUB_WEBHOOK_SECRET: app.webhook_secret,
      INTEGRATION_SIGNING_SECRET:
        existing.INTEGRATION_SIGNING_SECRET ??
        randomBytes(48).toString("base64url"),
    };
    await writeFile(path, JSON.stringify(secrets), { mode: 0o600 });
    await chmod(path, 0o600);
    await writeFile(
      resolve(directory, ".app-registration.json"),
      JSON.stringify(
        {
          id: app.id,
          slug: app.slug,
          installUrl: `https://github.com/apps/${app.slug}/installations/new`,
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600 },
    );
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(
      `<!doctype html><html lang="en"><meta charset="utf-8"><title>Feedbax registered</title><h1>App registered</h1><p>Credentials were saved privately. Deploy the service secret store, then <a href="https://github.com/apps/${app.slug}/installations/new">install the App on the selected feedback repositories</a>.</p></html>`,
    );
    console.log(
      `Registered App ${app.slug}. Credentials saved privately. Install URL: https://github.com/apps/${app.slug}/installations/new`,
    );
    server.close();
  } catch {
    response
      .writeHead(502)
      .end(
        "Registration could not finish. Check the local setup and restart this one-use registration flow. No credentials are displayed.",
      );
    server.close();
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Register the App at http://127.0.0.1:${port}/ (expires in 15 minutes).`,
  ),
);
setTimeout(() => server.close(), 15 * 60_000).unref();
