import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CliError } from "../../create-feedbax/src/flags.ts";
import { confirmStep, loadProject, tools, type Context } from "./context.ts";
import { applyPlan, planSummary, planUpgrade, type Plan } from "./merge.ts";
import { fetchPackument, fetchTemplate, registryUrl, safeRelativePath } from "./registry.ts";
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
  for (const version of [options.version, options.baseline])
    if (version !== undefined && !isVersion(version))
      throw new CliError(`${version} is not a version (expected x.y.z).`, 2);
  const progress = await readProgress(ctx.cwd);
  if (progress) {
    if (
      (options.version && options.version !== progress.to) ||
      (options.baseline && options.baseline !== progress.from)
    )
      throw new CliError(
        `An upgrade ${progress.from} → ${progress.to} is unfinished. Rerun npx feedbax migrate to resume it.`,
        2,
      );
    ctx.prompt.note(
      remainingSteps(progress).join("\n"),
      `Resume ${progress.from} → ${progress.to}${options.dryRun ? " (dry run: nothing changes)" : ""}`,
    );
    if (options.dryRun) return 0;
    return resume(ctx, progress);
  }
  const project = await loadProject(ctx);
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
  const packageChanged = plan.actions.some((action) => action.path === "package.json");
  const steps = [
    ...(packageChanged ? [`${project.pm} install`] : []),
    plan.migrations.length
      ? `Apply ${plan.migrations.length} new D1 migration(s) to production: ${plan.migrations.map((path) => path.slice("migrations/".length)).join(", ")}`
      : "Apply D1 migrations to production (none are new)",
    "Build and deploy",
    `Write .feedbax/version = ${to}`,
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
  const state: Progress = {
    from,
    to,
    step: "source",
    sourceIndex: 0,
    packageChanged,
    conflicts: conflicts.map((action) => action.path),
  };
  // Persist the exact source writes before starting, so interrupted merges are never merged twice.
  await saveJson(ctx.cwd, SOURCE_FILE, plan);
  await saveProgress(ctx.cwd, state);
  return resume(ctx, state);
}

const PROGRESS_FILE = ".feedbax/migrate.json";
const SOURCE_FILE = ".feedbax/migrate-source.json";
const STEPS = [
  "source",
  "conflicts",
  "install",
  "migrations",
  "build",
  "deploy",
  "version",
] as const;
type Step = (typeof STEPS)[number];
type Progress = {
  from: string;
  to: string;
  step: Step;
  sourceIndex: number;
  packageChanged: boolean;
  conflicts: string[];
};

async function saveJson(cwd: string, path: string, value: unknown): Promise<void> {
  await mkdir(join(cwd, ".feedbax"), { recursive: true });
  await writeFile(join(cwd, `${path}.tmp`), `${JSON.stringify(value)}\n`);
  await rename(join(cwd, `${path}.tmp`), join(cwd, path));
}
const saveProgress = (cwd: string, progress: Progress) => saveJson(cwd, PROGRESS_FILE, progress);

async function readProgress(cwd: string): Promise<Progress | null> {
  let text: string;
  try {
    text = await readFile(join(cwd, PROGRESS_FILE), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  try {
    const state = JSON.parse(text) as Progress;
    if (
      !isVersion(state.from) ||
      !isVersion(state.to) ||
      !STEPS.includes(state.step) ||
      !Number.isInteger(state.sourceIndex) ||
      state.sourceIndex < 0 ||
      typeof state.packageChanged !== "boolean" ||
      !Array.isArray(state.conflicts) ||
      !state.conflicts.every((path) => typeof path === "string" && safeRelativePath(path))
    )
      throw new Error("invalid progress");
    return state;
  } catch {
    throw new CliError(
      `${PROGRESS_FILE} is invalid. Restore it from your backup before resuming.`,
      2,
    );
  }
}

function remainingSteps(state: Progress): string[] {
  const labels: Record<Step, string> = {
    source: "Finish source merge",
    conflicts: "Resolve source conflicts",
    install: "Install dependencies",
    migrations: "Apply pending D1 migrations to production",
    build: "Build",
    deploy: "Deploy",
    version: `Write .feedbax/version = ${state.to}`,
  };
  return STEPS.slice(STEPS.indexOf(state.step))
    .filter(
      (step) =>
        (step !== "install" || state.packageChanged) &&
        (step !== "conflicts" || state.conflicts.length),
    )
    .map((step, index) => `${index + 1}. ${labels[step]}`);
}

async function resume(ctx: Context, state: Progress): Promise<number> {
  const advance = async (step: Step) => {
    state.step = step;
    await saveProgress(ctx.cwd, state);
  };
  try {
    if (state.step === "source") {
      const plan = JSON.parse(await readFile(join(ctx.cwd, SOURCE_FILE), "utf8"), (_key, value) =>
        value?.type === "Buffer" && Array.isArray(value.data) ? Buffer.from(value.data) : value,
      ) as Plan;
      if (plan.from !== state.from || plan.to !== state.to)
        throw new CliError("Saved source plan does not match the unfinished upgrade.", 2);
      for (; state.sourceIndex < plan.actions.length;) {
        await applyPlan(ctx.cwd, { ...plan, actions: [plan.actions[state.sourceIndex]!] });
        state.sourceIndex++;
        await saveProgress(ctx.cwd, state);
      }
      await advance(state.conflicts.length ? "conflicts" : "install");
      if (state.conflicts.length) {
        ctx.prompt.error(
          `Source updated to ${state.to} with conflicts:\n${plan.actions
            .filter((action) => action.kind === "conflict")
            .map((action) => `  ${action.path}: ${action.reason}`)
            .join("\n")}\nResolve each conflict, run your checks, then rerun npx feedbax migrate.`,
        );
        return 1;
      }
    }
    if (state.step === "conflicts") {
      for (const path of state.conflicts) {
        let text = "";
        try {
          text = await readFile(join(ctx.cwd, path), "utf8");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        if (/^(?:<<<<<<< your project|>>>>>>> feedbax )/m.test(text))
          throw new CliError(`Resolve the conflict in ${path}, then rerun npx feedbax migrate.`, 2);
      }
      if (
        !(await confirmStep(
          ctx,
          "Have you resolved every listed source conflict and run your checks?",
        ))
      )
        return 0;
      await advance("install");
    }
    const project = await loadProject(ctx);
    const { pm, wrangler } = tools(ctx, project);
    if (state.step === "install") {
      if (state.packageChanged)
        await ctx.prompt.step(`Install dependencies (${project.pm} install)`, () =>
          pm(["install"]),
        );
      await advance("migrations");
    }
    if (state.step === "migrations") {
      if (!(await confirmStep(ctx, "Apply pending D1 migrations to the production database?"))) {
        ctx.prompt.info("Paused. Run npx feedbax migrate to resume.");
        return 0;
      }
      await ctx.prompt.step("Apply D1 migrations (remote)", () =>
        wrangler(["d1", "migrations", "apply", "DB", "--remote"]),
      );
      await advance("build");
    }
    if (state.step === "build" || state.step === "deploy") {
      if (!(await confirmStep(ctx, `Build and deploy ${state.to}?`))) {
        ctx.prompt.info("Paused. Run npx feedbax migrate to resume.");
        return 0;
      }
      if (state.step === "build") {
        await ctx.prompt.step("Build", () => pm(["run", "build"]));
        await advance("deploy");
      }
      await ctx.prompt.step("Deploy", () => wrangler(["deploy"]));
      await advance("version");
    }
    await recordVersion(ctx.cwd, state.to);
    await rm(join(ctx.cwd, SOURCE_FILE), { force: true });
    await rm(join(ctx.cwd, PROGRESS_FILE));
    ctx.prompt.outro(`Upgraded to ${state.to}. Commit the changes, then run npx feedbax doctor.`);
    return 0;
  } catch (error) {
    ctx.prompt.error(`Upgrade paused at ${state.step}.\nRecovery: npx feedbax migrate`);
    throw error;
  }
}
