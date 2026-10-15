import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  unlink,
  writeFile,
  chmod,
} from "node:fs/promises";
import { join, dirname, isAbsolute } from "node:path";
import { tmpdir } from "node:os";

type SourceFile = { bytes: Buffer; mode: number };
type Change = {
  path: string;
  before: string | null;
  after: string | null;
  beforeHash: string | null;
  afterHash: string | null;
  mode: number;
};
export interface SourceUpgradePlan {
  format: 1;
  id: string;
  installation: string;
  fromVersion: string;
  toVersion: string;
  files: {
    path: string;
    baselineHash: string | null;
    localHash: string | null;
    targetHash: string | null;
    protected: boolean;
  }[];
  changes: Change[];
  conflicts: { path: string; preview: string | null }[];
  protected: string[];
}
type Journal = {
  format: 1;
  phase: "prepared" | "source-applied" | "rolling-back" | "rolled-back";
  plan: SourceUpgradePlan;
};
const execute = promisify(execFile);
const hash = (value: Buffer | null) =>
  value === null ? null : createHash("sha256").update(value).digest("hex");
const decode = (value: string | null) =>
  value === null ? null : Buffer.from(value, "base64");
const statePath = ".feedbax/source-upgrade.json";
const ignored = new Set([
  ".git",
  ".feedbax",
  ".wrangler",
  ".turbo",
  "node_modules",
  "dist",
]);
const protectedPaths = new Set(["src/feedbax.ts", "wrangler.jsonc"]);

function excluded(path: string) {
  return path
    .toLowerCase()
    .split("/")
    .some(
      (part) =>
        ignored.has(part) ||
        /^\.(env|dev\.vars)(\.|$)/.test(part) ||
        /\.(pem|key|p12|pfx)$/.test(part),
    );
}
function safeRelative(path: string) {
  if (
    !path ||
    isAbsolute(path) ||
    path.includes("\\") ||
    /[\r\n\0]/u.test(path) ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw Error("Upgrade contains an unsafe file path.");
}
async function safePath(root: string, path: string) {
  safeRelative(path);
  let current = root;
  for (const part of path.split("/")) {
    current = join(current, part);
    try {
      if ((await lstat(current)).isSymbolicLink())
        throw Error(`Upgrade refuses symbolic link: ${path}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return current;
}
async function readInstalled(
  root: string,
  path: string,
): Promise<SourceFile | null> {
  const full = await safePath(root, path);
  try {
    const info = await lstat(full);
    if (!info.isFile())
      throw Error(`Expected an ordinary source file: ${path}`);
    return { bytes: await readFile(full), mode: info.mode & 0o777 };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
async function sourceFiles(root: string) {
  const files = new Map<string, SourceFile>();
  const visit = async (directory: string, prefix = "") => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (
        ignored.has(entry.name) ||
        /^\.(env|dev\.vars)(\.|$)/.test(entry.name) ||
        /\.(pem|key|p12|pfx)$/.test(entry.name)
      )
        continue;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink())
        throw Error(`Template contains a symbolic link: ${path}`);
      if (entry.isDirectory()) await visit(join(directory, entry.name), path);
      else if (entry.isFile())
        files.set(path, (await readInstalled(root, path))!);
      else throw Error(`Template contains a non-source entry: ${path}`);
    }
  };
  await visit(root);
  return files;
}
const text = (value: Buffer) =>
  !value.includes(0) && Buffer.from(value.toString("utf8")).equals(value);
function ignoreRecoveryState(bytes: Buffer | null) {
  const content = bytes?.toString("utf8") ?? "";
  if (
    content
      .split(/\r?\n/)
      .some((line) =>
        [".feedbax/", "/.feedbax/", ".feedbax", "/.feedbax"].includes(
          line.trim(),
        ),
      )
  )
    return bytes;
  return Buffer.from(`${content.trimEnd()}\n.feedbax/\n`);
}
async function merge(local: Buffer, baseline: Buffer, target: Buffer) {
  if (![local, baseline, target].every(text))
    return { conflict: true, bytes: null };
  const directory = await mkdtemp(join(tmpdir(), "feedbax-source-merge-"));
  try {
    const files = ["installation", "released-baseline", "update"].map((name) =>
      join(directory, name),
    );
    await Promise.all(
      files.map((file, index) =>
        writeFile(file, [local, baseline, target][index]!, { mode: 0o600 }),
      ),
    );
    try {
      const result = await execute(
        "git",
        [
          "merge-file",
          "--diff3",
          "-p",
          "-L",
          "Installation",
          "-L",
          "Released baseline",
          "-L",
          "Update",
          ...files,
        ],
        { maxBuffer: 16 * 1024 * 1024 },
      );
      return { conflict: false, bytes: Buffer.from(result.stdout) };
    } catch (error) {
      const result = error as Error & {
        code?: number | string;
        stdout?: string;
      };
      if (
        typeof result.code === "number" &&
        result.code > 0 &&
        result.code < 128
      )
        return { conflict: true, bytes: Buffer.from(result.stdout ?? "") };
      throw Error(
        "Source merge could not run. Install Git and retry the preview.",
        { cause: error },
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function previewSourceUpgrade(options: {
  installation: string;
  baseline: string;
  target: string;
  fromVersion: string;
  toVersion: string;
}): Promise<SourceUpgradePlan> {
  const installation = await realpath(options.installation);
  const [baseline, target] = await Promise.all([
    sourceFiles(await realpath(options.baseline)),
    sourceFiles(await realpath(options.target)),
  ]);
  const plan: SourceUpgradePlan = {
    format: 1,
    id: randomUUID(),
    installation,
    fromVersion: options.fromVersion,
    toVersion: options.toVersion,
    files: [],
    changes: [],
    conflicts: [],
    protected: [],
  };
  const paths = [
    ...new Set([...baseline.keys(), ...target.keys(), ".gitignore"]),
  ].sort();
  if (new Set(paths.map((path) => path.toLowerCase())).size !== paths.length)
    throw Error(
      "Template paths differ only by case; review this upgrade manually.",
    );
  for (const path of paths) {
    const base = baseline.get(path) ?? null,
      next = target.get(path) ?? null;
    if (protectedPaths.has(path)) {
      plan.files.push({
        path,
        baselineHash: hash(base?.bytes ?? null),
        localHash: null,
        targetHash: hash(next?.bytes ?? null),
        protected: true,
      });
      plan.protected.push(path);
      continue;
    }
    const local = await readInstalled(installation, path);
    plan.files.push({
      path,
      baselineHash: hash(base?.bytes ?? null),
      localHash: hash(local?.bytes ?? null),
      targetHash: hash(next?.bytes ?? null),
      protected: false,
    });
    const before = local?.bytes ?? null;
    let after: Buffer | null;
    if (hash(before) === hash(base?.bytes ?? null)) after = next?.bytes ?? null;
    else if (
      hash(next?.bytes ?? null) === hash(base?.bytes ?? null) ||
      hash(before) === hash(next?.bytes ?? null)
    )
      after = before;
    else if (local && base && next) {
      const result = await merge(local.bytes, base.bytes, next.bytes);
      if (result.conflict) {
        plan.conflicts.push({
          path,
          preview: result.bytes?.toString("base64") ?? null,
        });
        continue;
      }
      after = result.bytes;
    } else {
      plan.conflicts.push({ path, preview: null });
      continue;
    }
    if (path === ".gitignore") after = ignoreRecoveryState(after);
    if (hash(before) !== hash(after))
      plan.changes.push({
        path,
        before: before?.toString("base64") ?? null,
        after: after?.toString("base64") ?? null,
        beforeHash: hash(before),
        afterHash: hash(after),
        mode: local?.mode ?? next?.mode ?? 0o644,
      });
  }
  return plan;
}

function validatePlan(plan: SourceUpgradePlan, allowConflicts = false) {
  if (
    plan.format !== 1 ||
    !Array.isArray(plan.changes) ||
    !Array.isArray(plan.conflicts) ||
    plan.changes.length > 10000
  )
    throw Error("Unsupported or invalid upgrade plan.");
  if (plan.conflicts.length && !allowConflicts)
    throw Error(
      "Upgrade has conflicts. Review them before applying; source was not changed.",
    );
  const paths = new Set<string>();
  for (const change of plan.changes) {
    safeRelative(change.path);
    if (
      paths.has(change.path.toLowerCase()) ||
      protectedPaths.has(change.path.toLowerCase()) ||
      excluded(change.path) ||
      hash(decode(change.before)) !== change.beforeHash ||
      hash(decode(change.after)) !== change.afterHash ||
      !Number.isInteger(change.mode) ||
      change.mode < 0 ||
      change.mode > 0o777
    )
      throw Error("Upgrade plan failed integrity validation.");
    paths.add(change.path.toLowerCase());
  }
}
async function writeAtomic(
  path: string,
  bytes: Buffer,
  mode = 0o600,
  beforeCommit?: () => Promise<void>,
) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.feedbax-write-${randomUUID()}`);
  try {
    await writeFile(temporary, bytes, { flag: "wx", mode });
    await beforeCommit?.();
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
async function save(root: string, journal: Journal) {
  const path = await safePath(root, statePath);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await chmod(dirname(path), 0o700);
  await writeAtomic(
    await safePath(root, ".feedbax/.gitignore"),
    Buffer.from("*\n"),
    0o600,
  );
  await writeAtomic(path, Buffer.from(JSON.stringify(journal)), 0o600);
}
async function load(root: string): Promise<Journal> {
  const path = await safePath(root, statePath);
  const journal = JSON.parse(await readFile(path, "utf8")) as Journal;
  if (
    journal.format !== 1 ||
    !["prepared", "source-applied", "rolling-back", "rolled-back"].includes(
      journal.phase,
    )
  )
    throw Error("Invalid source upgrade journal.");
  validatePlan(journal.plan);
  if (journal.plan.installation !== root)
    throw Error("Upgrade journal belongs to another Installation path.");
  return journal;
}
async function existingJournal(root: string) {
  try {
    return await load(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
}
async function replace(
  root: string,
  change: Change,
  expected: (string | null)[],
  reverse = false,
) {
  const path = await safePath(root, change.path);
  let bytes: Buffer | null = decode(reverse ? change.before : change.after);
  if (reverse && change.path === ".gitignore")
    bytes = ignoreRecoveryState(bytes);
  const verifyCurrent = async () => {
    if (
      !expected.includes(
        hash((await readInstalled(root, change.path))?.bytes ?? null),
      )
    )
      throw Error(
        `Source changed during operation: ${change.path}. Stopped to preserve it; recovery state is retained.`,
      );
  };
  if (bytes === null) {
    await verifyCurrent();
    await unlink(path).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
    return;
  }
  await writeAtomic(path, bytes, change.mode, verifyCurrent);
}
async function applySourceUpgradeUnlocked(
  installation: string,
  plan: SourceUpgradePlan,
) {
  const root = await realpath(installation);
  validatePlan(plan);
  if (root !== plan.installation)
    throw Error("Upgrade preview belongs to another Installation path.");
  const previous = await existingJournal(root);
  if (previous && ["prepared", "rolling-back"].includes(previous.phase))
    throw Error(
      "An unfinished source upgrade exists. Resume it before starting another preview.",
    );
  if (previous) {
    const archive = await safePath(
      root,
      `.feedbax/upgrades/${randomUUID()}.json`,
    );
    await writeAtomic(archive, Buffer.from(JSON.stringify(previous)), 0o600);
  }
  for (const change of plan.changes)
    if (
      hash((await readInstalled(root, change.path))?.bytes ?? null) !==
      change.beforeHash
    )
      throw Error(
        `Source changed after preview: ${change.path}. Preview again before applying.`,
      );
  await save(root, { format: 1, phase: "prepared", plan });
  for (const change of plan.changes)
    await replace(root, change, [change.beforeHash]);
  await save(root, { format: 1, phase: "source-applied", plan });
}
async function resumeSourceUpgradeUnlocked(installation: string) {
  const root = await realpath(installation),
    journal = await load(root);
  if (journal.phase === "rolling-back")
    return rollbackSourceUpgradeUnlocked(root);
  if (journal.phase === "source-applied") return;
  if (journal.phase !== "prepared")
    throw Error("No interrupted source upgrade is available to resume.");
  for (const change of journal.plan.changes) {
    const current = hash(
      (await readInstalled(root, change.path))?.bytes ?? null,
    );
    if (current !== change.beforeHash && current !== change.afterHash)
      throw Error(
        `Source changed during interrupted upgrade: ${change.path}. Resume stopped to preserve it.`,
      );
  }
  for (const change of journal.plan.changes)
    if (
      hash((await readInstalled(root, change.path))?.bytes ?? null) !==
      change.afterHash
    )
      await replace(root, change, [change.beforeHash, change.afterHash]);
  await save(root, { ...journal, phase: "source-applied" });
}
async function rollbackSourceUpgradeUnlocked(installation: string) {
  const root = await realpath(installation),
    journal = await load(root);
  if (journal.phase === "rolled-back") return;
  if (!["prepared", "source-applied", "rolling-back"].includes(journal.phase))
    throw Error("No source upgrade is available to roll back.");
  for (const change of journal.plan.changes) {
    const current = hash(
      (await readInstalled(root, change.path))?.bytes ?? null,
    );
    const restored = hash(
      change.path === ".gitignore"
        ? ignoreRecoveryState(decode(change.before))
        : decode(change.before),
    );
    const permitted =
      journal.phase === "source-applied"
        ? [change.afterHash]
        : [change.beforeHash, change.afterHash, restored];
    if (!permitted.includes(current))
      throw Error(
        `Source changed after upgrade: ${change.path}. Rollback stopped to preserve it.`,
      );
  }
  await save(root, { ...journal, phase: "rolling-back" });
  for (const change of [...journal.plan.changes].reverse()) {
    const restored = hash(
      change.path === ".gitignore"
        ? ignoreRecoveryState(decode(change.before))
        : decode(change.before),
    );
    await replace(
      root,
      change,
      [change.beforeHash, change.afterHash, restored],
      true,
    );
  }
  await save(root, { ...journal, phase: "rolled-back" });
}

async function withSourceLock<T>(
  installation: string,
  operation: () => Promise<T>,
) {
  const root = await realpath(installation);
  const lock = await safePath(root, ".feedbax/source-upgrade.lock");
  await mkdir(dirname(lock), { recursive: true, mode: 0o700 });
  await chmod(dirname(lock), 0o700);
  await writeAtomic(
    await safePath(root, ".feedbax/.gitignore"),
    Buffer.from("*\n"),
    0o600,
  );
  try {
    await writeFile(
      lock,
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
      { flag: "wx", mode: 0o600 },
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw Error(
        "Source upgrade lock exists. Wait for the running process, or verify an interrupted process has ended before removing .feedbax/source-upgrade.lock and resuming.",
        { cause: error },
      );
    throw error;
  }
  try {
    return await operation();
  } finally {
    await unlink(lock);
  }
}
export function applySourceUpgrade(
  installation: string,
  plan: SourceUpgradePlan,
) {
  return withSourceLock(installation, () =>
    applySourceUpgradeUnlocked(installation, plan),
  );
}
export function resumeSourceUpgrade(installation: string) {
  return withSourceLock(installation, () =>
    resumeSourceUpgradeUnlocked(installation),
  );
}
export function rollbackSourceUpgrade(installation: string) {
  return withSourceLock(installation, () =>
    rollbackSourceUpgradeUnlocked(installation),
  );
}

export async function sourceUpgradeStatus(installation: string) {
  const root = await realpath(installation);
  const journal = await existingJournal(root);
  if (!journal) return undefined;
  return {
    phase: journal.phase,
    fromVersion: journal.plan.fromVersion,
    toVersion: journal.plan.toVersion,
    files: journal.plan.changes.length,
    protected: journal.plan.protected,
  };
}

/** Writes review material outside the Installation; source remains untouched. */
export async function writeSourceUpgradeReview(plan: SourceUpgradePlan) {
  validatePlan(plan, true);
  const directory = await mkdtemp(join(tmpdir(), "feedbax-upgrade-review-"));
  try {
    for (const side of ["before", "after"] as const) {
      await mkdir(join(directory, side), { mode: 0o700 });
      for (const change of plan.changes) {
        const bytes = decode(change[side]);
        if (bytes !== null)
          await writeAtomic(
            await safePath(join(directory, side), change.path),
            bytes,
            0o600,
          );
      }
    }
    let patch: string;
    try {
      patch = (
        await execute(
          "git",
          [
            "diff",
            "--no-index",
            "--no-ext-diff",
            "--no-textconv",
            "--",
            "before",
            "after",
          ],
          { cwd: directory, maxBuffer: 32 * 1024 * 1024 },
        )
      ).stdout;
    } catch (error) {
      const result = error as Error & { code?: number; stdout?: string };
      if (result.code !== 1) throw error;
      patch = result.stdout ?? "";
    }
    await writeAtomic(join(directory, "review.diff"), Buffer.from(patch));
    for (const conflict of plan.conflicts) {
      safeRelative(conflict.path);
      if (conflict.preview !== null)
        await writeAtomic(
          await safePath(join(directory, "conflicts"), conflict.path),
          decode(conflict.preview)!,
        );
    }
    await writeAtomic(
      join(directory, "manifest.json"),
      Buffer.from(
        JSON.stringify(
          {
            format: plan.format,
            fromVersion: plan.fromVersion,
            toVersion: plan.toVersion,
            changes: plan.changes.map(({ path, beforeHash, afterHash }) => ({
              path,
              beforeHash,
              afterHash,
            })),
            conflicts: plan.conflicts.map(({ path }) => path),
            protected: plan.protected,
            files: plan.files,
          },
          null,
          2,
        ),
      ),
    );
    return directory;
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
