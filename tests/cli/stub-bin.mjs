#!/usr/bin/env node
// Executed through PATH. The CLI still spawns argument arrays with shell:false.
import { basename, dirname, join } from "node:path";
import { appendFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
const argv = process.argv.slice(2);
const stateFile = process.env.FEEDBAX_TEST_STATE;
const state = JSON.parse(readFileSync(stateFile, "utf8"));
const command = basename(process.argv[1]);
if (argv.join(" ") === "run build") {
  mkdirSync(join(process.cwd(), "dist/server/assets"), { recursive: true });
  writeFileSync(
    join(process.cwd(), "dist/server/assets/functions-fixture.js"),
    'var getViewer_createServerFn_handler = createServerRpc({ id: "fixture-viewer" });',
  );
}
const args = argv.slice(argv.indexOf("wrangler") + 1);
appendFileSync(process.env.FEEDBAX_TEST_LOG, JSON.stringify({ command, argv }) + "\n");
if (args[0] === "whoami")
  console.log(JSON.stringify({ loggedIn: true, accounts: [{ id: "account", name: "Team" }] }));
if (args[0] === "d1" && args[1] === "list")
  console.log(
    JSON.stringify(
      state.database
        ? [{ uuid: "12345678-1234-4234-8234-123456789abc", name: "my-feedback-db" }]
        : [],
    ),
  );
if (args[0] === "d1" && args[1] === "info")
  console.log(JSON.stringify({ uuid: "12345678-1234-4234-8234-123456789abc" }));
if (args[0] === "d1" && args[1] === "create") state.database = true;
if (args[0] === "r2" && args[1] === "bucket" && args[2] === "create") state.bucket = true;
if (args[0] === "queues" && args[1] === "create") state.queue = true;
if (args[0] === "deploy") {
  const path = args[2];
  const secrets = JSON.parse(readFileSync(path, "utf8"));
  const githubOAuth = Boolean(secrets.GITHUB_CLIENT_ID && secrets.GITHUB_CLIENT_SECRET);
  const googleOAuth = Boolean(secrets.GOOGLE_CLIENT_ID && secrets.GOOGLE_CLIENT_SECRET);
  const hostConfigured = /^\s*["']?appUrl["']?\s*:/m.test(
    readFileSync(join(process.cwd(), "feedbax.config.ts"), "utf8"),
  );
  state.githubOAuth = githubOAuth;
  state.googleOAuth = googleOAuth;
  state.hostConfigured = hostConfigured;
  if (
    (statSync(path).mode & 0o777) !== 0o600 ||
    (statSync(dirname(path)).mode & 0o777) !== 0o700 ||
    "PORTAL_URL" in secrets ||
    !secrets.FEEDBAX_HOST_SECRET ||
    !secrets.NOTION_TOKEN ||
    (!githubOAuth && !googleOAuth && !hostConfigured)
  )
    process.exit(4);
  state.secretPath = path;
  state.deployed = true;
}
writeFileSync(stateFile, JSON.stringify(state));
