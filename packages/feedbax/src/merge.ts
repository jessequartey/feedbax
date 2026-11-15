// 3-way source upgrade: for each template file, baseline → your project vs baseline → target.
// The baseline is the exact published template the project was generated from (or last
// migrated to), normalised the way create-feedbax scaffolded it.
import { execFile } from "node:child_process";
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { CliError } from "../../create-feedbax/src/flags.ts";
import { ensureRunWorkerFirst } from "./jsonc-edit.ts";
import { safeRelativePath, type Template, type TemplateFile } from "./registry.ts";
import { compareVersions } from "./version.ts";

const execFileAsync = promisify(execFile);

/** Your values live here. Never merged; only the structural edits below touch them. */
export const PROTECTED_FILES = ["feedbax.config.ts", "wrangler.jsonc"];
/** Never read or written by migrate. */
export function excludedPath(path: string): boolean {
  return (
    path
      .split("/")
      .some(
        (part) =>
          [".git", ".feedbax", ".wrangler", "node_modules", "dist"].includes(part) ||
          /^\.(?:env|dev\.vars)(?:\.|$)/.test(part),
      ) && path !== ".dev.vars.example"
  );
}

/** Programmatic edits to protected files, applied when the target includes them. */
export const STRUCTURAL_EDITS: {
  since: string;
  file: string;
  description: string;
  apply(text: string): string;
}[] = [
  {
    since: "0.3.1",
    file: "wrangler.jsonc",
    description:
      'add "/admin/enter" and "/changelog.rss" to assets.run_worker_first (admin sign-in links, RSS feed)',
    apply: (text) =>
      ensureRunWorkerFirst(ensureRunWorkerFirst(text, "/admin/enter"), "/changelog.rss"),
  },
];

export type Action =
  | { path: string; kind: "add" | "update"; bytes: Buffer; mode: number }
  | { path: string; kind: "delete" }
  | { path: string; kind: "merge"; bytes: Buffer }
  | { path: string; kind: "conflict"; bytes: Buffer | null; reason: string }
  | { path: string; kind: "protected"; reason: string }
  | { path: string; kind: "structural"; bytes: Buffer; reason: string };

export type Plan = {
  from: string;
  to: string;
  actions: Action[];
  /** New D1 migration files the target adds. */
  migrations: string[];
};

async function readLocal(cwd: string, path: string): Promise<TemplateFile | null> {
  const full = await safeLocalPath(cwd, path);
  try {
    const info = await lstat(full);
    if (!info.isFile()) throw new CliError(`${path} is not a regular file; move it and retry.`, 2);
    return { bytes: await readFile(full), mode: info.mode & 0o777 };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

/** Refuse unsafe template paths and symbolic links anywhere along the way. */
async function safeLocalPath(cwd: string, path: string): Promise<string> {
  if (!safeRelativePath(path)) throw new CliError(`Unsafe template path: ${path}`, 2);
  let current = cwd;
  for (const part of path.split("/")) {
    current = join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw new CliError(`migrate does not follow symbolic links: ${path}`, 2);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return current;
}

const isText = (bytes: Buffer) =>
  !bytes.includes(0) && Buffer.from(bytes.toString("utf8"), "utf8").equals(bytes);

/** Apply create-feedbax's scaffold step (package.json name) so the baseline matches. */
export function normalizeTemplate(template: Template, projectName: string | undefined): Template {
  const files = new Map(template.files);
  const pkg = files.get("package.json");
  if (pkg && projectName) {
    const json = JSON.parse(pkg.bytes.toString("utf8")) as Record<string, unknown>;
    json.name = projectName;
    files.set("package.json", {
      ...pkg,
      bytes: Buffer.from(`${JSON.stringify(json, null, 2)}\n`),
    });
  }
  return { version: template.version, files };
}

/** `git merge-file`: yours vs upstream, with conflict markers labelled for the user. */
export async function mergeText(
  yours: Buffer,
  base: Buffer,
  theirs: Buffer,
  labels: [string, string, string],
): Promise<{ bytes: Buffer; conflict: boolean }> {
  const directory = await mkdtemp(join(tmpdir(), "feedbax-merge-"));
  try {
    const files = ["yours", "base", "theirs"].map((name) => join(directory, name));
    await Promise.all([yours, base, theirs].map((bytes, index) => writeFile(files[index]!, bytes)));
    const args = ["merge-file", "-p", "-L", labels[0], "-L", labels[1], "-L", labels[2], ...files];
    try {
      const { stdout } = await execFileAsync("git", args, {
        encoding: "buffer",
        maxBuffer: 32 * 1024 * 1024,
      });
      return { bytes: stdout, conflict: false };
    } catch (error) {
      const failure = error as { code?: unknown; stdout?: Buffer };
      // git merge-file exits with the number of conflicts (1–127); anything else is an error.
      if (typeof failure.code === "number" && failure.code > 0 && failure.code < 128)
        return { bytes: failure.stdout ?? Buffer.alloc(0), conflict: true };
      throw new CliError("migrate needs Git to merge files. Install Git and retry.");
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function planUpgrade(options: {
  cwd: string;
  baseline: Template;
  target: Template;
}): Promise<Plan> {
  const { cwd } = options;
  let projectName: string | undefined;
  try {
    projectName = (
      JSON.parse(await readFile(join(cwd, "package.json"), "utf8")) as { name?: string }
    ).name;
  } catch {
    throw new CliError("package.json is not valid JSON. Fix it and retry.", 2);
  }
  const baseline = normalizeTemplate(options.baseline, projectName);
  const target = normalizeTemplate(options.target, projectName);
  const from = baseline.version,
    to = target.version;
  const labels: [string, string, string] = ["your project", `feedbax ${from}`, `feedbax ${to}`];
  const actions: Action[] = [];
  const paths = [...new Set([...baseline.files.keys(), ...target.files.keys()])]
    .filter((path) => !excludedPath(path))
    .sort();
  for (const path of paths) {
    const base = baseline.files.get(path) ?? null;
    const next = target.files.get(path) ?? null;
    const same = (a: TemplateFile | null, b: TemplateFile | null) =>
      a === b || (a !== null && b !== null && a.bytes.equals(b.bytes));
    if (same(base, next)) continue;
    if (PROTECTED_FILES.includes(path)) {
      actions.push({
        path,
        kind: "protected",
        reason: "upstream changed this file; your values are kept (review the release notes)",
      });
      continue;
    }
    const local = await readLocal(cwd, path);
    if (same(local, next)) continue;
    if (same(local, base)) {
      if (next) actions.push({ path, kind: base ? "update" : "add", ...next });
      else actions.push({ path, kind: "delete" });
      continue;
    }
    if (!next) {
      actions.push({
        path,
        kind: "conflict",
        bytes: null,
        reason: "removed upstream, but you changed it; delete it yourself if unused",
      });
      continue;
    }
    if (!local) {
      actions.push({
        path,
        kind: "conflict",
        bytes: null,
        reason: "you deleted it, but upstream changed it; restore it if needed",
      });
      continue;
    }
    if (!isText(local.bytes) || !isText(next.bytes) || (base && !isText(base.bytes))) {
      actions.push({
        path,
        kind: "conflict",
        bytes: null,
        reason: "binary file changed on both sides; your copy is kept",
      });
      continue;
    }
    const merged = await mergeText(local.bytes, base?.bytes ?? Buffer.alloc(0), next.bytes, labels);
    actions.push(
      merged.conflict
        ? {
            path,
            kind: "conflict",
            bytes: merged.bytes,
            reason: "conflict markers written; resolve them",
          }
        : { path, kind: "merge", bytes: merged.bytes },
    );
  }
  for (const edit of STRUCTURAL_EDITS) {
    if (compareVersions(to, edit.since) < 0) continue;
    const local = await readLocal(cwd, edit.file);
    if (!local) continue;
    const text = local.bytes.toString("utf8");
    const edited = edit.apply(text);
    if (edited !== text)
      actions.push({
        path: edit.file,
        kind: "structural",
        bytes: Buffer.from(edited),
        reason: edit.description,
      });
  }
  const migrations = [...target.files.keys()]
    .filter((path) => /^migrations\/[^/]+\.sql$/.test(path) && !baseline.files.has(path))
    .sort();
  return { from, to, actions, migrations };
}

export async function applyPlan(cwd: string, plan: Plan): Promise<void> {
  for (const action of plan.actions) {
    if (action.kind === "protected") continue;
    if (action.kind === "conflict" && !action.bytes) continue;
    const full = await safeLocalPath(cwd, action.path);
    if (action.kind === "delete") {
      await unlink(full).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
      continue;
    }
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, action.bytes!);
    if (action.kind === "add") await chmod(full, action.mode);
  }
}

export function planSummary(plan: Plan): string {
  const lines: string[] = [];
  const symbol: Record<Action["kind"], string> = {
    add: "+ add      ",
    update: "~ update   ",
    delete: "- delete   ",
    merge: "~ merge    ",
    conflict: "! conflict ",
    protected: "= keep     ",
    structural: "~ edit     ",
  };
  for (const action of plan.actions)
    lines.push(
      `${symbol[action.kind]}${action.path}${"reason" in action ? `  (${action.reason})` : ""}`,
    );
  if (!lines.length) lines.push("No source files change.");
  return lines.join("\n");
}
