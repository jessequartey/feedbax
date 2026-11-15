import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { CliError } from "../../create-feedbax/src/flags.ts";
import { confirmStep, loadProject, tools, type Context } from "./context.ts";
import { applyPlan, planSummary, planUpgrade, type Plan } from "./merge.ts";
import { fetchPackument, fetchTemplate, registryUrl } from "./registry.ts";
import {
  compareVersions,
  detectVersion,
  isVersion,
  OLDEST_MIGRATABLE,
  recordVersion,
  type DetectedVersion,
  VERSION,
} from "./version.ts";

const execFileAsync = promisify(execFile);

export type MigrateOptions = {
  version?: string;
  baseline?: string;
  dryRun: boolean;
  force: boolean;
};

/** Uncommitted changes, or null when the folder is not inside a Git work tree. */
export async function gitChanges(cwd: string): Promise<string[] | null> {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--porcelain"], { cwd });
    return stdout.split("\n").filter(Boolean);
  } catch {
    return null;
  }
}

export async function migrate(ctx: Context, options: MigrateOptions): Promise<number> {
  const project = await loadProject(ctx);
  for (const version of [options.version, options.baseline])
    if (version !== undefined && !isVersion(version))
      throw new CliError(`${version} is not a version (expected x.y.z).`, 2);
  const changes = await gitChanges(ctx.cwd);
  if (!options.force && !options.dryRun) {
    if (changes === null)
      throw new CliError(
        "This project is not in a Git repository, so the upgrade could not be reviewed or undone. Run git init && git add -A && git commit, or pass --force.",
        2,
      );
    if (changes.length)
      throw new CliError(
        `Commit or stash your changes first so the upgrade can be reviewed and undone (or pass --force):\n${changes.slice(0, 10).join("\n")}`,
        2,
      );
  }
  const packument = await fetchPackument(ctx.fetch, registryUrl(ctx.env));
  const published = Object.keys(packument.versions);
  const detected: DetectedVersion = options.baseline
    ? { version: options.baseline, source: "flag" }
    : await detectVersion(ctx.cwd, published);
  const to = options.version ?? packument.latest;
  const from = detected.version;
  if (compareVersions(from, OLDEST_MIGRATABLE) < 0)
    throw new CliError(
      `Projects created before ${OLDEST_MIGRATABLE} cannot be migrated. Create a new project with npx create-feedbax@latest.`,
      2,
    );
  if (!packument.versions[to]) throw new CliError(`create-feedbax@${to} is not published.`, 2);
  if (!packument.versions[from])
    throw new CliError(
      `This project's baseline create-feedbax@${from} is not published, so there is nothing to compare against. Pass --baseline <version>.`,
      2,
    );
  const sourceLabel = {
    recorded: ".feedbax/version",
    "package.json": "package.json version",
    fingerprint: "the 0.3.0 migrations fingerprint",
    flag: "--baseline",
  }[detected.source];
  ctx.prompt.info(`Project is on ${from} (from ${sourceLabel}); target is ${to}.`);
  const order = compareVersions(to, from);
  if (order === 0) {
    ctx.prompt.info(`Already on ${to}. Run npx feedbax doctor to check the project.`);
    return 0;
  }
  if (order < 0) throw new CliError(`Downgrading from ${from} to ${to} is not supported.`, 2);
  if (compareVersions(to, VERSION) > 0)
    ctx.prompt.info(
      `This is feedbax ${VERSION}; ${to} may need upgrade steps it does not know. Prefer npx feedbax@${to} migrate ${to}.`,
    );

  const [baseline, target] = await ctx.prompt.step(`Download templates ${from} and ${to}`, () =>
    Promise.all([
      fetchTemplate(ctx.fetch, packument, from),
      fetchTemplate(ctx.fetch, packument, to),
    ]),
  );
  const plan = await planUpgrade({ cwd: ctx.cwd, baseline, target });
  const conflicts = plan.actions.filter((action) => action.kind === "conflict");
  const packageChanged = plan.actions.some(
    (action) => action.path === "package.json" && action.kind !== "conflict",
  );
  const steps = [
    `Write .feedbax/version = ${to}`,
    ...(packageChanged ? [`${project.pm} install`] : []),
    plan.migrations.length
      ? `Apply ${plan.migrations.length} new D1 migration(s) to production: ${plan.migrations.map((path) => path.slice("migrations/".length)).join(", ")}`
      : "Apply D1 migrations to production (none are new)",
    "Build and deploy",
  ];
  ctx.prompt.note(
    `${planSummary(plan)}\n\nThen:\n${steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}${
      conflicts.length
        ? "\n\nConflicts stop the upgrade before install, migrations and deploy."
        : ""
    }\n\nNever changed: feedbax.config.ts values, wrangler.jsonc IDs/names/routes/vars, .dev.vars, Cloudflare secrets.`,
    `Upgrade ${from} → ${to}${options.dryRun ? " (dry run: nothing changes)" : ""}`,
  );
  if (options.dryRun) {
    if (changes?.length)
      ctx.prompt.info("Your Git tree has uncommitted changes; commit them before the real run.");
    return 0;
  }
  if (!(await confirmStep(ctx, `Apply the source changes for ${to}?`)))
    throw new CliError("Upgrade cancelled. Nothing changed.", 130);
  await applyPlan(ctx.cwd, plan);
  await recordVersion(ctx.cwd, to);
  if (conflicts.length) {
    ctx.prompt.error(conflictReport(plan));
    return 1;
  }
  ctx.prompt.info(`Source upgraded to ${to}. Review it with git diff.`);
  return finish(ctx, plan, packageChanged);
}

function conflictReport(plan: Plan): string {
  const lines = plan.actions.flatMap((action) =>
    action.kind === "conflict" ? [`  ${action.path}: ${action.reason}`] : [],
  );
  return `Source updated to ${plan.to} with ${lines.length} conflict(s):\n${lines.join("\n")}\nResolve each one (search for <<<<<<<), run your checks, then run npx feedbax deploy. To undo everything: git checkout -- . && git clean -fd`;
}

async function finish(ctx: Context, plan: Plan, packageChanged: boolean): Promise<number> {
  const project = await loadProject(ctx);
  const { pm, wrangler } = tools(ctx, project);
  if (packageChanged)
    await ctx.prompt.step(`Install dependencies (${project.pm} install)`, () => pm(["install"]));
  if (
    await confirmStep(
      ctx,
      plan.migrations.length
        ? `Apply ${plan.migrations.length} new D1 migration(s) to the production database?`
        : "Apply pending D1 migrations to the production database?",
    )
  )
    await ctx.prompt.step("Apply D1 migrations (remote)", () =>
      wrangler(["d1", "migrations", "apply", "DB", "--remote"]),
    );
  else {
    ctx.prompt.info("Skipped migrations and deploy. Run npx feedbax deploy when ready.");
    return 0;
  }
  if (await confirmStep(ctx, `Build and deploy ${plan.to}?`)) {
    await ctx.prompt.step("Build", () => pm(["run", "build"]));
    await ctx.prompt.step("Deploy", () => wrangler(["deploy"]));
    ctx.prompt.outro(`Upgraded to ${plan.to}. Commit the changes, then run npx feedbax doctor.`);
  } else ctx.prompt.info("Skipped deploy. Run npx feedbax deploy when ready.");
  return 0;
}
