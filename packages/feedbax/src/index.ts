#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Cancelled, CliError } from "../../create-feedbax/src/flags.ts";
import { createPrompter, createRunner, redact } from "../../create-feedbax/src/io.ts";
import type { Clients, Prompter, Run } from "../../create-feedbax/src/types.ts";
import { add, INTEGRATIONS, type Integration } from "./add.ts";
import { admin } from "./admin.ts";
import { deployProject, loadProject, type Context } from "./context.ts";
import { doctor } from "./doctor.ts";
import { migrate } from "./migrate.ts";
import { fetchPackument, registryUrl } from "./registry.ts";
import { compareVersions, detectVersion, VERSION } from "./version.ts";

const COMMANDS = {
  migrate: {
    usage: "feedbax migrate [version] [--dry-run] [--force] [--yes] [--baseline <version>]",
    about: `Upgrade this project's source to [version] (default: the latest create-feedbax).
Merges each upstream change into your files (3-way, against the template you started
from), keeps feedbax.config.ts values, wrangler.jsonc IDs/names/routes/vars, .dev.vars and
secrets, writes conflict markers where both sides changed, then applies new D1 migrations
and deploys (each after a confirm). Records the version in .feedbax/version only after
deployment succeeds. Rerun migrate after an interruption to resume from .feedbax/.
  --dry-run              Print the plan or remaining steps; change nothing
  --force                Run on a dirty (or non-Git) working tree
  --yes                  Confirm every step (required without a terminal)
  --baseline <version>   The create-feedbax version this project came from, if detection fails`,
    positionals: 1,
    booleans: ["--dry-run", "--force", "--yes"],
    values: ["--baseline"],
  },
  add: {
    usage: `feedbax add <${INTEGRATIONS.join("|")}> [--yes]`,
    about: `Add an integration: validates inputs and provider access, updates feedbax.config.ts,
sets Cloudflare secrets with Wrangler and offers to redeploy. Failures list changes and a
recovery command. Secrets come from masked prompts or the environment, never flags.
  github         GITHUB_TOKEN (Issues read/write) + integrations.github   [--repo owner/repo]
  github-login   GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET (prints the exact callback URL)
  google-login   GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (prints the exact redirect URI)
  host-login     appUrl + FEEDBAX_HOST_SECRET                              [--app-url <https-url>]
  email          RESEND_API_KEY + notifications.email.from                [--from "Name <a@b.com>"]
  webhooks       How to manage webhook endpoints in /admin/settings
  --yes          Never prompt; redeploy without asking`,
    positionals: 1,
    booleans: ["--yes"],
    values: ["--repo", "--app-url", "--from"],
  },
  doctor: {
    usage: "feedbax doctor",
    about:
      "Check config, Cloudflare secrets, wrangler.jsonc bindings, /api/health, Notion access and\nGitHub access (when enabled). Prints a fix for each failure; exits 1 if any check fails.",
    positionals: 0,
    booleans: [],
    values: [],
  },
  deploy: {
    usage: "feedbax deploy",
    about: "Build, apply D1 migrations to production, deploy.",
    positionals: 0,
    booleans: [],
    values: [],
  },
  admin: {
    usage: "feedbax admin",
    about:
      "Print a single-use admin sign-in link for the deployed portal (vars.PORTAL_URL), valid for\n15 minutes and signed with BETTER_AUTH_SECRET from .dev.vars.",
    positionals: 0,
    booleans: [],
    values: [],
  },
} as const;
type Command = keyof typeof COMMANDS;

export const HELP = `feedbax ${VERSION} — manage a Feedbax portal. Run it inside your generated project.

Usage:
${Object.values(COMMANDS)
  .map((command) => `  ${command.usage}`)
  .join("\n")}

  feedbax <command> --help    Details for one command
  feedbax --version

New project: npx create-feedbax@latest`;

export type Parsed = {
  command?: Command;
  positionals: string[];
  flags: Set<string>;
  values: Record<string, string>;
  help: boolean;
  version: boolean;
};

export function parseArgs(argv: string[]): Parsed {
  const parsed: Parsed = {
    positionals: [],
    flags: new Set(),
    values: {},
    help: false,
    version: false,
  };
  const [first, ...rest] = argv;
  if (first === "--help" || first === "-h") parsed.help = true;
  else if (first === "--version" || first === "-v") parsed.version = true;
  else if (first !== undefined) {
    if (!(first in COMMANDS))
      throw new CliError(`Unknown command: ${first}. Run feedbax --help.`, 2);
    parsed.command = first as Command;
  }
  if (!parsed.command) return parsed;
  const spec = COMMANDS[parsed.command];
  for (let index = 0; index < rest.length; index++) {
    const arg = rest[index]!;
    if (arg === "--help" || arg === "-h") parsed.help = true;
    else if (arg === "--version") parsed.version = true;
    else if (arg.startsWith("-")) {
      const [key, ...value] = arg.split("=");
      if ((spec.booleans as readonly string[]).includes(key!) && !value.length) {
        if (parsed.flags.has(key!)) throw new CliError("Do not repeat flags.", 2);
        parsed.flags.add(key!);
      } else if ((spec.values as readonly string[]).includes(key!)) {
        if (key! in parsed.values) throw new CliError("Do not repeat flags.", 2);
        const given = value.length ? value.join("=") : rest[++index];
        if (given === undefined || given.startsWith("--"))
          throw new CliError(`${key} needs a value.`, 2);
        parsed.values[key!] = given;
      } else
        throw new CliError(
          `Unknown flag for feedbax ${parsed.command}: ${key}. Secrets belong in environment variables. Run feedbax ${parsed.command} --help.`,
          2,
        );
    } else parsed.positionals.push(arg);
  }
  if (parsed.help || parsed.version) return parsed;
  if (parsed.positionals.length > spec.positionals)
    throw new CliError(`Too many arguments. Usage: ${spec.usage}`, 2);
  return parsed;
}

export type CliDeps = {
  cwd?: string;
  env?: Record<string, string | undefined>;
  prompt?: Prompter;
  run?: Run;
  fetch?: typeof fetch;
  clients?: Clients;
  log?: (line: string) => void;
  interactive?: boolean;
};

/** Print a one-line upgrade hint when a newer Feedbax release is on npm. */
export async function notifyIfOutdated(ctx: Context): Promise<void> {
  if (ctx.env.NO_UPDATE_NOTIFIER || ctx.env.CI) return;
  if (!ctx.interactive && ctx.env.FEEDBAX_CHECK_UPDATES !== "1") return;
  try {
    const packument = await fetchPackument(
      (input, init) => ctx.fetch(input, { ...init, signal: AbortSignal.timeout(2500) }),
      registryUrl(ctx.env),
    );
    const current = await detectVersion(ctx.cwd, Object.keys(packument.versions)).then(
      (d) => d.version,
      () => VERSION,
    );
    const newest = compareVersions(packument.latest, VERSION) >= 0 ? packument.latest : VERSION;
    if (compareVersions(newest, current) > 0)
      ctx.prompt.info(
        `Update available: ${current} → ${newest}. Run npx feedbax@latest migrate when ready.`,
      );
  } catch {
    /* ignore offline or registry errors */
  }
}

export async function main(argv = process.argv.slice(2), deps: CliDeps = {}): Promise<number> {
  const env = deps.env ?? process.env;
  const log = deps.log ?? ((line: string) => console.log(line));
  const hidden = Object.entries(env)
    .filter(([key]) => /TOKEN|SECRET|PASSWORD|API_KEY|CLIENT_ID/.test(key))
    .map(([, value]) => value ?? "")
    .filter(Boolean);
  let prompt = deps.prompt ?? createPrompter(false);
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.on("SIGINT", abort);
  try {
    const parsed = parseArgs(argv);
    if (parsed.version) {
      log(VERSION);
      return 0;
    }
    if (parsed.help || !parsed.command) {
      log(
        parsed.command
          ? `${COMMANDS[parsed.command].usage}\n\n${COMMANDS[parsed.command].about}`
          : HELP,
      );
      return parsed.help || !argv.length ? 0 : 2;
    }
    const yes = parsed.flags.has("--yes");
    prompt = deps.prompt ?? createPrompter(yes);
    const ctx: Context = {
      cwd: deps.cwd ?? process.cwd(),
      env,
      prompt,
      run: deps.run ?? createRunner(controller.signal),
      fetch:
        deps.fetch ??
        ((input, init) =>
          fetch(input, {
            ...init,
            signal: AbortSignal.any([
              controller.signal,
              init?.signal ?? AbortSignal.timeout(30_000),
            ]),
          })),
      clients: deps.clients,
      log,
      yes,
      interactive: deps.interactive ?? Boolean(process.stdin.isTTY),
      hidden,
    };
    switch (parsed.command) {
      case "migrate":
        return await migrate(ctx, {
          version: parsed.positionals[0],
          baseline: parsed.values["--baseline"],
          dryRun: parsed.flags.has("--dry-run"),
          force: parsed.flags.has("--force"),
        });
      case "add": {
        const integration = parsed.positionals[0];
        if (!integration || !(INTEGRATIONS as readonly string[]).includes(integration))
          throw new CliError(`Usage: ${COMMANDS.add.usage}`, 2);
        const code = await add(ctx, integration as Integration, {
          repo: parsed.values["--repo"],
          appUrl: parsed.values["--app-url"],
          from: parsed.values["--from"],
        });
        await notifyIfOutdated(ctx);
        return code;
      }
      case "doctor": {
        const code = await doctor(ctx);
        await notifyIfOutdated(ctx);
        return code;
      }
      case "deploy":
        await deployProject(ctx, await loadProject(ctx));
        await notifyIfOutdated(ctx);
        return 0;
      case "admin":
        return await admin(ctx);
    }
    return 2;
  } catch (error) {
    if (error instanceof Cancelled || (error as Error)?.name === "AbortError") {
      prompt.info("Cancelled.");
      return 130;
    }
    prompt.error(redact(error instanceof Error ? error.message : String(error), hidden));
    return error instanceof CliError ? error.exitCode : 1;
  } finally {
    process.off("SIGINT", abort);
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = await main();
