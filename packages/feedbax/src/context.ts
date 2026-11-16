// What every command shares: the project on disk, the prompter, and Wrangler/npm runners.
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CliError } from "../../create-feedbax/src/flags.ts";
import { redact } from "../../create-feedbax/src/io.ts";
import { parseJsonc } from "../../create-feedbax/src/jsonc.ts";
import { exists, readVars } from "../../create-feedbax/src/project.ts";
import { execCommand, parseJsonOutput } from "../../create-feedbax/src/setup.ts";
import type { Clients, PackageManager, Prompter, Run } from "../../create-feedbax/src/types.ts";

export type Wrangler = {
  name?: string;
  account_id?: string;
  main?: string;
  assets?: { run_worker_first?: unknown; not_found_handling?: string; binding?: string };
  vars?: Record<string, unknown>;
  d1_databases?: {
    binding?: string;
    database_name?: string;
    database_id?: string;
    migrations_dir?: string;
  }[];
  r2_buckets?: { binding?: string; bucket_name?: string }[];
  queues?: {
    producers?: { binding?: string; queue?: string }[];
    consumers?: { queue?: string }[];
  };
  triggers?: { crons?: string[] };
};

export type Context = {
  cwd: string;
  env: Record<string, string | undefined>;
  prompt: Prompter;
  run: Run;
  fetch: typeof fetch;
  clients?: Clients;
  /** Plain stdout, for values people copy (links). */
  log: (line: string) => void;
  yes: boolean;
  interactive: boolean;
  /** Values never printed (secrets from .dev.vars and the environment). */
  hidden: string[];
};

export type Project = {
  pm: PackageManager;
  wrangler: Wrangler;
  vars: Record<string, string>;
  hasDevVars: boolean;
};

export async function loadProject(ctx: Context): Promise<Project> {
  const missing = [];
  for (const file of ["package.json", "feedbax.config.ts", "wrangler.jsonc"])
    if (!(await exists(join(ctx.cwd, file)))) missing.push(file);
  if (missing.length)
    throw new CliError(
      `Run feedbax from your generated Feedbax project folder (missing ${missing.join(", ")}).`,
      2,
    );
  let wrangler: Wrangler;
  try {
    wrangler = parseJsonc(await readFile(join(ctx.cwd, "wrangler.jsonc"), "utf8")) as Wrangler;
  } catch {
    throw new CliError("wrangler.jsonc is not valid JSONC. Fix its syntax and retry.", 2);
  }
  const hasDevVars = await exists(join(ctx.cwd, ".dev.vars"));
  const vars = await readVars(ctx.cwd);
  ctx.hidden.push(
    ...Object.entries(vars).flatMap(([key, value]) => (key === "PORTAL_URL" ? [] : [value])),
  );
  return { pm: await packageManager(ctx), wrangler, vars, hasDevVars };
}

async function packageManager(ctx: Context): Promise<PackageManager> {
  if (await exists(join(ctx.cwd, "pnpm-lock.yaml"))) return "pnpm";
  if ((await exists(join(ctx.cwd, "bun.lock"))) || (await exists(join(ctx.cwd, "bun.lockb"))))
    return "bun";
  if (await exists(join(ctx.cwd, "package-lock.json"))) return "npm";
  const agent = ctx.env.npm_config_user_agent ?? "";
  return agent.startsWith("pnpm/") ? "pnpm" : agent.startsWith("bun/") ? "bun" : "npm";
}

/** The deployed portal origin: `vars.PORTAL_URL` in wrangler.jsonc (never .dev.vars). */
export function portalUrl(project: Project): string | undefined {
  const value = project.wrangler.vars?.PORTAL_URL;
  return typeof value === "string" ? value.replace(/\/+$/, "") : undefined;
}

export function isDeployedUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)
    );
  } catch {
    return false;
  }
}

export function requireDeployedUrl(project: Project): string {
  const url = portalUrl(project);
  if (!url || !isDeployedUrl(url))
    throw new CliError(
      "vars.PORTAL_URL in wrangler.jsonc is not a deployed https URL. Finish setup (npx create-feedbax) or deploy first.",
      2,
    );
  return url;
}

const TOOL_ENV = { CI: "true", WRANGLER_SEND_METRICS: "false" };

export function tools(ctx: Context, project: Project) {
  const clean = (text: string) => redact(text, ctx.hidden);
  const wrangler = async (args: string[], stdin?: string) => {
    const [cmd, flags] = execCommand(project.pm, "wrangler", args);
    const result = await ctx.run(cmd, flags, { cwd: ctx.cwd, env: TOOL_ENV, stdin });
    if (result.code) {
      const output = result.stderr || result.stdout;
      const login = /not logged in|authenticat|login|10000/i.test(output)
        ? "\nSign in with npx wrangler login (or set CLOUDFLARE_API_TOKEN), then retry."
        : "";
      throw new CliError(
        clean(`wrangler ${args.slice(0, 3).join(" ")} failed.\n${output}${login}`),
      );
    }
    return result.stdout;
  };
  const pm = async (args: string[]) => {
    const result = await ctx.run(project.pm, args, { cwd: ctx.cwd, env: TOOL_ENV });
    if (result.code)
      throw new CliError(
        clean(`${project.pm} ${args.join(" ")} failed.\n${result.stderr || result.stdout}`),
      );
    return result.stdout;
  };
  return {
    wrangler,
    pm,
    /** Production secret names, from `wrangler secret list`. */
    secretNames: async (): Promise<string[]> => {
      const list = parseJsonOutput<{ name: string }[]>(
        await wrangler(["secret", "list", "--format", "json"]),
      );
      return list.map((secret) => secret.name);
    },
    /** Set production secrets in one Worker version, via a private temporary file. */
    putSecrets: async (values: Record<string, string>): Promise<void> => {
      ctx.hidden.push(...Object.values(values));
      const directory = await mkdtemp(join(tmpdir(), "feedbax-secrets-"));
      await chmod(directory, 0o700);
      const file = join(directory, "secrets.json");
      try {
        await writeFile(file, JSON.stringify(values), { mode: 0o600 });
        await wrangler(["secret", "bulk", file]);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  };
}

/** Build, apply D1 migrations, deploy (the order of `npm run deploy`). */
export async function deployProject(ctx: Context, project: Project): Promise<void> {
  const { pm, wrangler } = tools(ctx, project);
  await ctx.prompt.step("Build", () => pm(["run", "build"]));
  await ctx.prompt.step("Apply D1 migrations (remote)", () =>
    wrangler(["d1", "migrations", "apply", "DB", "--remote"]),
  );
  await ctx.prompt.step("Deploy", () => wrangler(["deploy"]));
  const url = portalUrl(project);
  if (url) ctx.prompt.info(`Deployed: ${url}`);
}

/** Ask before an outward-facing step; --yes answers yes. */
export async function confirmStep(ctx: Context, question: string): Promise<boolean> {
  if (ctx.yes) return true;
  if (!ctx.interactive)
    throw new CliError(`${question} Rerun with --yes to confirm in a non-interactive terminal.`, 2);
  return ctx.prompt.confirm(question, true);
}
