import type { FeedbaxConfig } from "../../../src/contracts/config.ts";
import { loadClients } from "../../create-feedbax/src/providers.ts";
import { loadConfig } from "./config-edit.ts";
import {
  isDeployedUrl,
  loadProject,
  portalUrl,
  tools,
  type Context,
  type Project,
} from "./context.ts";
import { VERSION } from "./version.ts";

export type Check = {
  name: string;
  problems: { problem: string; fix: string }[];
  skipped?: string;
};

const REQUIRED_ROUTES = ["/api/*", "/_serverFn/*", "/admin/enter", "/changelog.rss"];

export function bindingProblems(project: Project): Check["problems"] {
  const w = project.wrangler;
  const problems: Check["problems"] = [];
  const add = (problem: string, fix: string) => problems.push({ problem, fix });
  if (!w.account_id)
    add(
      "account_id is missing",
      "Set account_id in wrangler.jsonc (npx wrangler whoami shows it).",
    );
  const db = w.d1_databases?.find((entry) => entry.binding === "DB");
  if (!db)
    add(
      "no D1 binding named DB",
      "Restore the DB entry in d1_databases (see the template's wrangler.jsonc).",
    );
  else {
    if (!db.database_id || /^0{8}-/.test(db.database_id))
      add(
        "DB has no real database_id",
        "Set database_id from npx wrangler d1 list (or rerun npx create-feedbax).",
      );
    if (db.migrations_dir !== "migrations")
      add(
        'DB.migrations_dir is not "migrations"',
        'Set "migrations_dir": "migrations" on the DB binding.',
      );
  }
  if (!w.r2_buckets?.some((entry) => entry.binding === "IMAGES" && entry.bucket_name))
    add("no R2 binding named IMAGES", "Restore the IMAGES entry in r2_buckets.");
  const producer = w.queues?.producers?.find((entry) => entry.binding === "SYNC_QUEUE");
  if (!producer?.queue)
    add("no Queue producer named SYNC_QUEUE", "Restore queues.producers with binding SYNC_QUEUE.");
  else if (!w.queues?.consumers?.some((entry) => entry.queue === producer.queue))
    add(
      `no consumer for queue ${producer.queue}`,
      `Add a queues.consumers entry for "${producer.queue}".`,
    );
  if (!w.triggers?.crons?.length)
    add("no cron trigger (Notion polling)", 'Add "triggers": { "crons": ["*/5 * * * *"] }.');
  const routes = w.assets?.run_worker_first;
  if (routes !== true) {
    const missing = REQUIRED_ROUTES.filter(
      (route) => !(Array.isArray(routes) && routes.includes(route)),
    );
    if (missing.length)
      add(
        `assets.run_worker_first is missing ${missing.join(", ")}`,
        `Add ${missing.map((route) => `"${route}"`).join(", ")} to assets.run_worker_first (npx feedbax migrate does this for you).`,
      );
  }
  if (!isDeployedUrl(portalUrl(project)))
    add(
      "vars.PORTAL_URL is not a deployed https URL",
      "Set vars.PORTAL_URL to your portal origin, e.g. https://feedback.example.com.",
    );
  return problems;
}

/** A private board only stays private if the Worker sees every request before static files. */
export function privateBoardProblems(project: Project, config: FeedbaxConfig): Check["problems"] {
  if (!config.auth.private) return [];
  const problems: Check["problems"] = [];
  const assets = project.wrangler.assets;
  if (assets?.run_worker_first !== true)
    problems.push({
      problem: "auth.private is on but assets.run_worker_first is not true",
      fix: 'Set "assets": { "binding": "ASSETS", "run_worker_first": true } in wrangler.jsonc.',
    });
  if (assets?.binding !== "ASSETS")
    problems.push({
      problem: "auth.private is on but the assets binding is not named ASSETS",
      fix: 'Add "binding": "ASSETS" to assets in wrangler.jsonc so the Worker can serve static files.',
    });
  return problems;
}

export function requiredSecrets(config: FeedbaxConfig | undefined): string[] {
  return [
    "BETTER_AUTH_SECRET",
    "FEEDBAX_HOST_SECRET",
    "NOTION_TOKEN",
    ...(config?.integrations.github ? ["GITHUB_TOKEN"] : []),
    ...(config?.notifications.email ? ["RESEND_API_KEY"] : []),
  ];
}

/** Check config, secrets, bindings, health, Notion and GitHub. Exit 1 on any failure. */
export async function doctor(ctx: Context): Promise<number> {
  const project = await loadProject(ctx);
  const checks: Check[] = [];
  const check = async (name: string, body: (c: Check) => Promise<void> | void) => {
    const c: Check = { name, problems: [] };
    try {
      await body(c);
    } catch (error) {
      c.problems.push({
        problem: error instanceof Error ? error.message : String(error),
        fix: "Fix the problem above and run npx feedbax doctor again.",
      });
    }
    checks.push(c);
  };
  let config: FeedbaxConfig | undefined;
  await check("feedbax.config.ts", async () => {
    config = await loadConfig(ctx.cwd);
  });
  await check("wrangler.jsonc bindings", (c) => {
    c.problems.push(...bindingProblems(project));
  });
  await check("private board", (c) => {
    if (config) c.problems.push(...privateBoardProblems(project, config));
    else c.skipped = "feedbax.config.ts did not load";
  });
  await check("Cloudflare secrets", async (c) => {
    let names: string[];
    try {
      names = await tools(ctx, project).secretNames();
    } catch {
      c.problems.push({
        problem: "could not list Worker secrets",
        fix: "Sign in with npx wrangler login (or set CLOUDFLARE_API_TOKEN) and deploy once, then retry.",
      });
      return;
    }
    for (const name of requiredSecrets(config))
      if (!names.includes(name))
        c.problems.push({
          problem: `${name} is not set`,
          fix:
            name === "GITHUB_TOKEN"
              ? "Run npx feedbax add github."
              : name === "RESEND_API_KEY"
                ? "Run npx feedbax add email."
                : `Run npx wrangler secret put ${name} (the value is in .dev.vars).`,
        });
    for (const [id, secret, add] of [
      ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "github-login"],
      ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "google-login"],
    ] as const)
      if (names.includes(id) !== names.includes(secret))
        c.problems.push({
          problem: `only one of ${id} / ${secret} is set, so the Worker refuses to start`,
          fix: `Run npx feedbax add ${add} to set both.`,
        });
  });
  const portal = portalUrl(project);
  await check("Portal health (/api/health)", async (c) => {
    if (!isDeployedUrl(portal)) {
      c.problems.push({ problem: "the portal is not deployed", fix: "Run npx feedbax deploy." });
      return;
    }
    let body: { ok?: boolean; notion?: string; github?: string };
    try {
      const response = await ctx.fetch(`${portal}/api/health`, {
        signal: AbortSignal.timeout(10_000),
      });
      body = (await response.json()) as typeof body;
      if (!response.ok) throw new Error(String(response.status));
    } catch {
      c.problems.push({
        problem: `${portal}/api/health did not answer`,
        fix: "Run npx feedbax deploy, then check npx wrangler tail for errors.",
      });
      return;
    }
    if (body.ok !== true)
      c.problems.push({
        problem: "health reports not ok",
        fix: "Check npx wrangler tail; usually D1 migrations are missing: npx feedbax deploy.",
      });
    if (body.notion === "failing")
      c.problems.push({
        problem: "Notion sync is failing in production",
        fix: "Check the NOTION_TOKEN secret and that the Feedbax database is shared with the integration (Content access).",
      });
    if (body.github === "failing")
      c.problems.push({
        problem: "GitHub sync is failing in production",
        fix: "Check the GITHUB_TOKEN secret has Issues read/write on the configured repo (npx feedbax add github).",
      });
  });
  const factories = ctx.clients ?? (await loadClients());
  await check("Notion access", async (c) => {
    const token = ctx.env.NOTION_TOKEN || project.vars.NOTION_TOKEN;
    if (!token) {
      c.problems.push({
        problem: "no NOTION_TOKEN in .dev.vars or the environment",
        fix: "Add NOTION_TOKEN to .dev.vars (your integration's secret) to check Notion access.",
      });
      return;
    }
    const notion = factories.notion(token, ctx.fetch);
    try {
      await notion.me();
    } catch {
      c.problems.push({
        problem: "Notion rejected NOTION_TOKEN",
        fix: "Copy the Internal Integration Secret again from https://www.notion.so/profile/integrations.",
      });
      return;
    }
    const id = config?.integrations.notion.dataSourceId.replaceAll("-", "");
    if (!id) return;
    const target = (await notion.findFeedbaxDataSources()).find(
      (item) => item.dataSourceId.replaceAll("-", "") === id,
    );
    if (!target)
      c.problems.push({
        problem: "the configured Feedbax database is not visible to the integration",
        fix: "In Notion, open the integration's Content access → Edit access and add the Feedbax page.",
      });
    else if (target.needsRepair)
      c.problems.push({
        problem: "the Feedbax database is missing columns",
        fix: "Restore the renamed or deleted Feedbax columns (rerun npx create-feedbax to repair them).",
      });
  });
  if (config?.integrations.github) {
    const repo = config.integrations.github.repo;
    await check(`GitHub access (${repo})`, async (c) => {
      const token = ctx.env.GITHUB_TOKEN || project.vars.GITHUB_TOKEN;
      if (!token) {
        c.problems.push({
          problem: "no GITHUB_TOKEN in .dev.vars or the environment",
          fix: "Run npx feedbax add github.",
        });
        return;
      }
      try {
        const checked = await factories.github(token, ctx.fetch).checkRepo(repo);
        if (checked.archived)
          c.problems.push({
            problem: `${repo} is archived`,
            fix: "Unarchive it, or run npx feedbax add github to pick another repo.",
          });
        if (!checked.hasIssues)
          c.problems.push({
            problem: `Issues are disabled on ${repo}`,
            fix: "Enable Issues in the repository's Settings → General → Features.",
          });
      } catch {
        c.problems.push({
          problem: `the token cannot write issues on ${repo}`,
          fix: "Create a fine-grained token with Issues: Read and write on that repo, then run npx feedbax add github.",
        });
      }
    });
  }
  let failed = 0;
  for (const c of checks) {
    if (!c.problems.length) ctx.prompt.info(`✓ ${c.name}`);
    else {
      failed++;
      ctx.prompt.error(
        `✗ ${c.name}\n${c.problems.map((p) => `  - ${p.problem}\n    Fix: ${p.fix}`).join("\n")}`,
      );
    }
  }
  ctx.prompt.info(`feedbax ${VERSION}`);
  if (failed) {
    ctx.prompt.error(`${failed} check(s) failed.`);
    return 1;
  }
  ctx.prompt.outro("All checks passed.");
  return 0;
}
