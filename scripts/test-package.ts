import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCli } from "./cli-build.ts";
import { createRunner } from "../packages/create-feedbax/src/io.ts";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const run = createRunner();
async function checked(
  cmd: string,
  args: string[],
  cwd: string,
  env: Record<string, string> = {},
): Promise<string> {
  const result = await run(cmd, args, { cwd, env });
  if (result.code)
    throw new Error(
      `${cmd} ${args.join(" ")} failed (${result.code})\n${stripVTControlCharacters(result.stderr || result.stdout).slice(0, 2400)}`,
    );
  return result.stdout;
}
export async function testPackage(): Promise<void> {
  await buildCli();
  const temp = await mkdtemp(join(tmpdir(), "feedbax-package-"));
  try {
    const packed = JSON.parse(
      await checked(
        "npm",
        ["pack", "--json", "--pack-destination", temp],
        join(root, "packages/create-feedbax"),
      ),
    ) as { filename: string; files: { path: string }[] }[];
    const tarball = join(temp, packed[0]!.filename);
    for (const file of packed[0]!.files)
      assert(!/(?:^|\/)(?:node_modules|tests|registry|scripts|\.dev\.vars)$/.test(file.path));
    // Install the tarball independently; validates its bin, dependencies and exports.
    const harness = join(temp, "harness");
    await mkdir(harness);
    await writeFile(join(harness, "package.json"), '{"private":true,"type":"module"}');
    await checked(
      "npm",
      ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball],
      harness,
    );
    const packedCli = join(harness, "node_modules/create-feedbax/dist/index.mjs");
    assert.equal(
      (await checked(process.execPath, [packedCli, "--version"], harness)).trim(),
      "0.3.0",
    );
    assert(
      (await checked(process.execPath, [packedCli, "--help"], harness)).includes("--notion-page"),
    );
    // Check each package manager's tarball-launch syntax against the installed binary.
    await checked(
      "npm",
      ["exec", "--yes", `--package=${tarball}`, "--", "create-feedbax", "--version"],
      harness,
    );
    await checked("pnpm", ["--package", tarball, "dlx", "create-feedbax", "--version"], harness);
    await checked("bunx", ["--package", tarball, "create-feedbax", "--version"], harness);
    console.log("package: npm exec, pnpm dlx and bunx tarball launch passed");
    const bin = join(temp, "bin");
    await mkdir(bin);
    for (const name of ["npm", "npx", "pnpm", "bun", "bunx"]) {
      const file = join(bin, name);
      await copyFile(join(root, "tests/cli/stub-bin.mjs"), file);
      const { chmod } = await import("node:fs/promises");
      await chmod(file, 0o755);
    }
    const projects = join(temp, "projects");
    await mkdir(projects);
    const state = join(temp, "state.json"),
      log = join(temp, "commands.jsonl");
    await writeFile(state, "{}");
    await writeFile(log, "");
    const env = {
      PATH: `${bin}:${process.env.PATH}`,
      FEEDBAX_TEST_STATE: state,
      FEEDBAX_TEST_LOG: log,
      NOTION_TOKEN: "sentinel-notion-token",
      GITHUB_TOKEN: "sentinel-github-token",
      CLOUDFLARE_API_TOKEN: "sentinel-cf-token",
      CLOUDFLARE_ACCOUNT_ID: "account",
    };
    const argv = [
      join(root, "tests/cli/package-driver.ts"),
      packedCli,
      "my-feedback",
      "--yes",
      "--template",
      "notion-github",
      "--github-repo",
      "team/app",
      "--anonymous",
      "false",
    ];
    const output = await checked(process.execPath, argv, projects, env);
    assert(output.includes("https://my-feedback.team.workers.dev"));
    assert(!output.includes("sentinel-"));
    const project = join(projects, "my-feedback");
    const config = await readFile(join(project, "feedbax.config.ts"), "utf8");
    assert(config.includes("team/app"));
    assert(config.includes("12345678-1234-4234-8234-123456789abc"));
    assert.equal((await stat(join(project, ".dev.vars"))).mode & 0o777, 0o600);
    const ignore = await readFile(join(project, ".gitignore"), "utf8");
    assert(ignore.includes("node_modules"));
    assert(ignore.includes(".dev.vars"));
    await assert.rejects(stat(join(project, "_gitignore")));
    const vars = await readFile(join(project, ".dev.vars"), "utf8");
    const bindings = JSON.parse(await readFile(join(project, "wrangler.jsonc"), "utf8"));
    assert.equal(bindings.d1_databases[0].binding, "DB");
    assert.equal(bindings.r2_buckets[0].binding, "IMAGES");
    assert.equal(bindings.queues.producers[0].binding, "SYNC_QUEUE");
    assert(
      !(await readdir(project)).some((name) =>
        ["tests", "registry", "scripts", "packages", ".github"].includes(name),
      ),
    );
    const pkg = JSON.parse(await readFile(join(project, "package.json"), "utf8"));
    assert(!pkg.devDependencies["drizzle-kit"]);
    assert(!pkg.devEngines);
    const complete = JSON.parse(await readFile(state, "utf8"));
    assert(complete.deployed);
    await assert.rejects(stat(complete.secretPath));
    await checked(process.execPath, argv, projects, env);
    assert.equal(await readFile(join(project, ".dev.vars"), "utf8"), vars);
    const commands = await readFile(log, "utf8");
    assert(!commands.includes("sentinel-"));
    assert.equal(commands.match(/"create"/g)?.length, 3);
    console.log(
      "package: packed CLI non-interactive E2E + rerun + private secrets passed (fake providers and PATH binaries)",
    );
    // All real installs/builds use the generated tree, never a second template.
    const failures: string[] = [];
    for (const pm of ["npm", "pnpm", "bun"]) {
      await rm(join(project, "node_modules"), { recursive: true, force: true });
      try {
        await checked(pm, ["install"], project, { CI: "true" });
        console.log(`package: generated app installs with ${pm}`);
        await checked(pm, ["run", "build"], project, { CI: "true" });
        console.log(`package: generated app installs and builds with ${pm}`);
      } catch (error) {
        failures.push(`${pm}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (failures.length)
      throw new Error(`Generated-app acceptance failed:\n${failures.join("\n\n")}`);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await testPackage();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
