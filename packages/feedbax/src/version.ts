import { readFile, readdir, mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CliError } from "../../create-feedbax/src/flags.ts";
import { exists } from "../../create-feedbax/src/project.ts";

/** This CLI's version. A unit test keeps it equal to packages/feedbax/package.json. */
export const VERSION = "0.3.1";
/** The oldest generated-project version `feedbax migrate` can start from. */
export const OLDEST_MIGRATABLE = "0.3.0";
export const VERSION_FILE = ".feedbax/version";

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

export function isVersion(value: string): boolean {
  return SEMVER.test(value);
}

/** Semver precedence for x.y.z[-pre]; a prerelease sorts before its release. */
export function compareVersions(a: string, b: string): number {
  const left = SEMVER.exec(a),
    right = SEMVER.exec(b);
  if (!left || !right) throw new CliError(`Not a version: ${left ? b : a}`, 2);
  for (let index = 1; index <= 3; index++) {
    const difference = Number(left[index]) - Number(right[index]);
    if (difference) return Math.sign(difference);
  }
  if (left[4] === right[4]) return 0;
  if (!left[4]) return 1;
  if (!right[4]) return -1;
  return left[4] < right[4] ? -1 : 1;
}

export type DetectedVersion = {
  version: string;
  source: "recorded" | "package.json" | "fingerprint" | "flag";
};

/**
 * Which create-feedbax template this project was generated from (or last migrated to).
 * Order: `.feedbax/version` (written since 0.3.1) → package.json `version` when it names a
 * published create-feedbax version (generated projects keep the template's version field) →
 * the migrations fingerprint of a 0.3.0 project. 0.2.x projects are refused.
 */
export async function detectVersion(cwd: string, published: string[]): Promise<DetectedVersion> {
  const recordedPath = join(cwd, VERSION_FILE);
  if (await exists(recordedPath)) {
    const recorded = (await readFile(recordedPath, "utf8")).trim();
    if (!isVersion(recorded))
      throw new CliError(
        `${VERSION_FILE} does not contain a version. Restore it from git, or pass --baseline <version>.`,
        2,
      );
    return { version: recorded, source: "recorded" };
  }
  if (
    (await exists(join(cwd, "src/feedbax.ts"))) &&
    !(await exists(join(cwd, "src/contracts/config.ts")))
  )
    throw new CliError(
      "This is a Feedbax 0.2.x project. 0.2.x cannot be migrated: create a new project with npx create-feedbax@latest (see the CHANGELOG).",
      2,
    );
  try {
    const pkg = JSON.parse(await readFile(join(cwd, "package.json"), "utf8")) as {
      version?: unknown;
    };
    if (
      typeof pkg.version === "string" &&
      published.includes(pkg.version) &&
      compareVersions(pkg.version, OLDEST_MIGRATABLE) >= 0
    )
      return { version: pkg.version, source: "package.json" };
  } catch {
    /* fall through to the fingerprint */
  }
  let migrations: string[] = [];
  try {
    migrations = (await readdir(join(cwd, "migrations"))).filter((name) => name.endsWith(".sql"));
  } catch {
    /* no migrations directory: not a recognisable project */
  }
  // 0.3.0 shipped migrations 0000–0004; 0.3.1 added 0005_admin_foundation.
  if (
    migrations.includes("0004_github_creator.sql") &&
    !migrations.some((name) => name.startsWith("0005_"))
  )
    return { version: "0.3.0", source: "fingerprint" };
  throw new CliError(
    "Could not tell which Feedbax version this project was created from. Pass --baseline <version> (the create-feedbax version you generated it with).",
    2,
  );
}

export async function recordVersion(cwd: string, version: string): Promise<void> {
  await mkdir(join(cwd, ".feedbax"), { recursive: true });
  await writeFile(join(cwd, `${VERSION_FILE}.tmp`), `${version}\n`);
  await rename(join(cwd, `${VERSION_FILE}.tmp`), join(cwd, VERSION_FILE));
}
