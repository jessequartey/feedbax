#!/usr/bin/env node
// Executed through PATH. The CLI still spawns argument arrays with shell:false.
import { basename } from "node:path";
import { appendFileSync, readFileSync, statSync, writeFileSync } from "node:fs";
const argv = process.argv.slice(2);
const stateFile = process.env.FEEDBAX_TEST_STATE;
const state = JSON.parse(readFileSync(stateFile, "utf8"));
const command = basename(process.argv[1]);
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
  if (
    (statSync(path).mode & 0o777) !== 0o600 ||
    "PORTAL_URL" in secrets ||
    !secrets.FEEDBAX_HOST_SECRET ||
    !secrets.NOTION_TOKEN
  )
    process.exit(4);
  state.secretPath = path;
  state.deployed = true;
}
writeFileSync(stateFile, JSON.stringify(state));
