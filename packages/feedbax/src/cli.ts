#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { diagnoseInstallation, diagnosticsPassed } from "./doctor";
import {
  loadInstallationConfig,
  readLocalEnvironment,
  readWranglerConfiguration,
} from "./installation";

const exits = {
  usage: 2,
  configuration: 10,
  doctor: 20,
  deployment: 30,
} as const;
const version = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
).version;
const command = process.argv[2] ?? "info";
const flags = process.argv.slice(3);
try {
  if (["--help", "-h", "help"].includes(command))
    console.log(
      "Usage: feedbax <doctor|deploy [--dry-run] [--yes] [--pairing-bootstrap]|pair-github <GitHub-installation-id>|rotate-api-key|info>",
    );
  else if (["--version", "-v"].includes(command)) console.log(version);
  else {
    const allowed =
      command === "deploy"
        ? ["--dry-run", "--yes", "--pairing-bootstrap"]
        : command === "pair-github" &&
            flags.length === 1 &&
            /^[1-9][0-9]*$/.test(flags[0]!)
          ? flags
          : [];
    if (flags.some((flag) => !allowed.includes(flag)))
      fail("Unknown option. Run feedbax --help.", exits.usage);
    if (command === "info") await info();
    else if (command === "doctor") await doctor();
    else if (command === "deploy") await deploy();
    else if (command === "pair-github") await pairGitHub();
    else if (command === "rotate-api-key") await rotateApiKey();
    else
      fail("Usage: feedbax <doctor|deploy|rotate-api-key|info>", exits.usage);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Feedbax failed.");
  process.exitCode =
    typeof error === "object" && error && "exitCode" in error
      ? Number(error.exitCode)
      : exits.configuration;
}
async function info() {
  const env = {
    ...(await readLocalEnvironment(process.cwd())),
    ...process.env,
  };
  const config = await loadInstallationConfig(process.cwd(), env);
  console.log(
    `Feedbax ${version}\nProduct: ${config.product.name}\nDocumentation: https://feedbax.dev/docs`,
  );
}
async function doctor(pairingBootstrap = false) {
  const results = await diagnoseInstallation({ pairingBootstrap });
  for (const result of results) {
    const marker =
      result.status === "pass" ? "✓" : result.status === "warn" ? "!" : "✗";
    console.log(`${marker} ${result.name}: ${result.message}`);
    if (result.repair) console.log(`  ${result.repair}`);
  }
  if (!diagnosticsPassed(results))
    fail("Feedbax doctor found problems.", exits.doctor);
  console.log("Feedbax doctor passed.");
}
async function deploy() {
  const pairingBootstrap = flags.includes("--pairing-bootstrap");
  if (pairingBootstrap) {
    const config = await loadInstallationConfig(process.cwd(), {
      ...(await readLocalEnvironment(process.cwd())),
      ...process.env,
    });
    if (config.provider !== "github")
      fail(
        "Pairing bootstrap is only for GitHub Installations.",
        exits.configuration,
      );
    console.log(
      "Deploying an unpaired GitHub portal. Content remains unavailable until App authorization completes.",
    );
  }
  await doctor(pairingBootstrap);
  if (flags.includes("--dry-run")) {
    await run("pnpm", ["exec", "wrangler", "deploy", "--dry-run"]);
    return;
  }
  const config = await readWranglerConfiguration(process.cwd());
  console.log(
    `Deployment target:\nAccount: ${config.account_id ?? "Wrangler default (shown by wrangler whoami)"}\nWorker: ${config.name}\nHostnames: ${config.routes?.map((route) => (typeof route === "string" ? route : route.pattern)).join(", ") || "workers.dev"}\nSecrets: provider pairing/connection secrets, FEEDBAX_API_KEY_HASH, PARTICIPATION_SIGNING_SECRET, and enabled Connected Profile/Turnstile secrets. Values are never printed.`,
  );
  if (!flags.includes("--yes")) {
    const terminal = createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const answer = (
      await terminal.question(
        "Deploy this Worker and its configured secrets with Wrangler? (y/N) ",
      )
    )
      .trim()
      .toLowerCase();
    terminal.close();
    if (!["y", "yes"].includes(answer))
      fail("Deployment cancelled.", exits.deployment);
  }
  const env = {
    ...(await readLocalEnvironment(process.cwd())),
    ...process.env,
  };
  const secrets = Object.fromEntries(
    [
      "NOTION_TOKEN",
      "GITHUB_PAIRING_SECRET",
      "GITHUB_SERVICE_SECRET",
      "FEEDBAX_API_KEY_HASH",
      "PARTICIPATION_SIGNING_SECRET",
      "IDENTITY_HANDOFF_SECRET",
      "EMAIL_PROVIDER_SECRET",
      "TURNSTILE_SECRET_KEY",
    ].flatMap((name) => (env[name] ? [[name, env[name]]] : [])),
  );
  const temporary = await mkdtemp(join(tmpdir(), "feedbax-deploy-"));
  try {
    const path = join(temporary, "secrets.json");
    await writeFile(path, JSON.stringify(secrets), { mode: 0o600 });
    await run("pnpm", ["exec", "wrangler", "deploy", "--secrets-file", path]);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
async function rotateApiKey() {
  const plaintext = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(plaintext).digest("base64url");
  await run(
    "pnpm",
    ["exec", "wrangler", "secret", "put", "FEEDBAX_API_KEY_HASH"],
    `${hash}\n`,
  );
  const path = join(process.cwd(), ".dev.vars");
  let contents = "";
  try {
    contents = await readFile(path, "utf8");
  } catch {
    /* A production-only installation may have no local secrets. */
  }
  const line = `FEEDBAX_API_KEY_HASH=${JSON.stringify(hash)}`;
  await writeFile(
    path,
    /^FEEDBAX_API_KEY_HASH=.*$/m.test(contents)
      ? contents.replace(/^FEEDBAX_API_KEY_HASH=.*$/m, line)
      : `${contents.trimEnd()}\n${line}\n`,
    { mode: 0o600 },
  );
  console.log(
    `API key rotated successfully. Copy it now; plaintext is not stored:\n${plaintext}`,
  );
}
async function run(executable: string, args: string[], input?: string) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      stdio: input ? ["pipe", "inherit", "inherit"] : "inherit",
    });
    if (input) child.stdin!.end(input);
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(
            Object.assign(new Error(`${executable} failed.`), {
              exitCode: exits.deployment,
            }),
          ),
    );
  });
}
function fail(message: string, exitCode: number): never {
  throw Object.assign(new Error(message), { exitCode });
}

async function pairGitHub() {
  if (flags.length !== 1 || !/^[1-9][0-9]*$/.test(flags[0]!))
    fail("Usage: feedbax pair-github <GitHub-installation-id>", exits.usage);
  const env = {
    ...(await readLocalEnvironment(process.cwd())),
    ...process.env,
  };
  const config = await loadInstallationConfig(process.cwd(), env);
  if (
    config.provider !== "github" ||
    !config.product.siteUrl ||
    !env.GITHUB_PAIRING_SECRET ||
    env.GITHUB_PAIRING_SECRET.length < 32
  )
    fail(
      "Configure GitHub, product.siteUrl, and GITHUB_PAIRING_SECRET before pairing.",
      exits.configuration,
    );
  const response = await fetch(`${config.github.serviceUrl}/v1/pair`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      installationId: config.github.installationId,
      origin: config.product.siteUrl,
      githubInstallationId: Number(flags[0]),
      repositoryId: config.github.repository.id,
      pairingSecret: env.GITHUB_PAIRING_SECRET,
    }),
  });
  if (!response.ok)
    fail(
      "Pairing could not start. Verify the service's trusted portal origin and App configuration.",
      exits.configuration,
    );
  const body = (await response.json()) as { authorizeUrl?: string };
  if (
    !body.authorizeUrl ||
    new URL(body.authorizeUrl).origin !== "https://github.com"
  )
    fail(
      "The service returned an invalid authorization destination.",
      exits.configuration,
    );
  console.log(
    `Authorize repository access in your browser:\n${body.authorizeUrl}\nAfter GitHub confirms pairing, run feedbax doctor. Binding credentials are delivered directly to the portal; do not copy credentials from the browser.`,
  );
}
