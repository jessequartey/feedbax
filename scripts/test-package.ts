import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCli } from "./cli-build.ts";
import { viewerRpcId } from "../packages/create-feedbax/src/verify.ts";
import { createRunner } from "../packages/create-feedbax/src/io.ts";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const run = createRunner();
export function parsePackedPackage(output: string) {
  const parsed: unknown = JSON.parse(output);
  assert(parsed && typeof parsed === "object", "npm pack returned no package metadata");
  // npm 11 emits an array; npm 12 keys the same metadata by package name.
  const packages: unknown[] = Array.isArray(parsed) ? parsed : Object.values(parsed);
  assert.equal(packages.length, 1, "npm pack must return exactly one package");
  const packed = packages[0];
  assert(packed && typeof packed === "object", "npm pack returned invalid package metadata");
  assert("name" in packed && packed.name === "create-feedbax", "npm pack returned another package");
  assert(
    "filename" in packed &&
      typeof packed.filename === "string" &&
      packed.filename.endsWith(".tgz") &&
      basename(packed.filename) === packed.filename,
    "npm pack returned an invalid tarball filename",
  );
  assert("files" in packed && Array.isArray(packed.files), "npm pack returned no file list");
  const files = packed.files.map((file: unknown) => {
    assert(
      file && typeof file === "object" && "path" in file && typeof file.path === "string",
      "npm pack returned an invalid file entry",
    );
    return { path: file.path };
  });
  return { filename: packed.filename, files };
}
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
// Root may prepare the final template separately; CLI-only acceptance can reuse that snapshot.
export async function testPackage(
  options: { build?: boolean; apps?: boolean } = {},
): Promise<void> {
  if (options.build !== false) await buildCli();
  const temp = await mkdtemp(join(tmpdir(), "feedbax-package-"));
  try {
    const packed = parsePackedPackage(
      await checked(
        "npm",
        ["pack", "--json", "--pack-destination", temp],
        join(root, "packages/create-feedbax"),
      ),
    );
    const tarball = join(temp, packed.filename);
    for (const file of packed.files)
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
      GITHUB_CLIENT_ID: "sentinel-oauth-client",
      GITHUB_CLIENT_SECRET: "sentinel-oauth-secret",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
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
    const output = stripVTControlCharacters(await checked(process.execPath, argv, projects, env));
    assert(output.includes("https://my-feedback.team.workers.dev"));
    assert(!output.includes("sentinel-"));
    assert(output.includes("https://my-feedback.team.workers.dev/api/auth/callback/github"));
    assert(output.includes("GitHub sign-in is configured"));
    assert(output.includes("verification remain"));
    assert(!output.includes("Ready for feedback"));
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
    assert.deepEqual(bindings.assets, {
      not_found_handling: "single-page-application",
      run_worker_first: ["/api/*", "/_serverFn/*", "/admin/enter"],
    });
    assert.deepEqual(bindings.observability, { enabled: true, redact_query_string: true });
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
    assert.deepEqual(
      JSON.parse(await readFile(join(project, "wrangler.jsonc"), "utf8")).assets,
      bindings.assets,
    );
    assert.equal(
      JSON.parse(await readFile(join(project, "wrangler.jsonc"), "utf8")).observability
        .redact_query_string,
      true,
    );
    const commands = await readFile(log, "utf8");
    assert(!commands.includes("sentinel-"));
    assert.equal(commands.match(/"create"/g)?.length, 3);
    console.log(
      "package: packed CLI non-interactive E2E + rerun + private secrets passed (fake providers and PATH binaries)",
    );
    // Exercise the packed entry's selected-login contract with independent fresh projects.
    for (const login of ["github", "google", "host"] as const) {
      const caseDir = join(temp, `login-${login}`);
      await mkdir(caseDir);
      const caseState = join(caseDir, "state.json"),
        caseLog = join(caseDir, "commands.jsonl");
      await writeFile(caseState, "{}");
      await writeFile(caseLog, "");
      const caseEnv = {
        ...env,
        FEEDBAX_TEST_STATE: caseState,
        FEEDBAX_TEST_LOG: caseLog,
        GITHUB_TOKEN: "",
        GITHUB_CLIENT_ID: login === "github" ? env.GITHUB_CLIENT_ID : "",
        GITHUB_CLIENT_SECRET: login === "github" ? env.GITHUB_CLIENT_SECRET : "",
        GOOGLE_CLIENT_ID: login === "google" ? "sentinel-google-client" : "",
        GOOGLE_CLIENT_SECRET: login === "google" ? "sentinel-google-secret" : "",
      };
      const args = [argv[0]!, packedCli, "my-feedback", "--yes", `--login=${login}`];
      if (login === "host") args.push("--app-url=https://app.example");
      const output = stripVTControlCharacters(
        await checked(process.execPath, args, caseDir, caseEnv),
      );
      assert(!output.includes("sentinel-"));
      assert(!output.includes("Ready for feedback"));
      assert(
        output.includes(
          login === "host"
            ? "Host login integration pending"
            : `${login === "github" ? "GitHub" : "Google"} sign-in is configured`,
        ),
      );
      const deployed = JSON.parse(await readFile(caseState, "utf8"));
      assert(deployed.deployed);
      assert.equal(deployed.githubOAuth, login === "github");
      assert.equal(deployed.googleOAuth, login === "google");
      assert.equal(deployed.hostConfigured, login === "host");
      await assert.rejects(stat(deployed.secretPath));
      const savedOnlyEnv = {
        ...caseEnv,
        GITHUB_CLIENT_ID: "",
        GITHUB_CLIENT_SECRET: "",
        GOOGLE_CLIENT_ID: "",
        GOOGLE_CLIENT_SECRET: "",
      };
      const resumed = await run(process.execPath, [argv[0]!, packedCli, "my-feedback", "--yes"], {
        cwd: caseDir,
        env: savedOnlyEnv,
      });
      assert.equal(resumed.code, login === "host" ? 0 : 2);
      if (login !== "host") {
        assert((resumed.stdout + resumed.stderr).includes("production OAuth credentials"));
        await checked(
          process.execPath,
          [argv[0]!, packedCli, "my-feedback", "--yes"],
          caseDir,
          caseEnv,
        );
      }
    }
    const rejectedDir = join(temp, "rejected");
    await mkdir(rejectedDir);
    for (const args of [["--login=google"], ["--login=host"], ["--login=github"]]) {
      const result = await run(
        process.execPath,
        [argv[0]!, packedCli, "my-feedback", "--yes", ...args],
        { cwd: rejectedDir, env: { ...env, GITHUB_CLIENT_ID: "", GITHUB_CLIENT_SECRET: "" } },
      );
      assert.equal(result.code, 2);
      assert.deepEqual(await readdir(rejectedDir), []);
      assert(!(result.stdout + result.stderr).includes("sentinel-"));
    }
    console.log(
      "package: packed GitHub/Google/host selection + saved resume + missing-login preflight passed",
    );
    if (options.apps === false) return;
    // All real installs/builds use the generated tree, never a second template.
    const failures: string[] = [];
    for (const pm of ["npm", "pnpm", "bun"]) {
      await rm(join(project, "node_modules"), { recursive: true, force: true });
      try {
        await checked(pm, ["install"], project, { CI: "true" });
        console.log(`package: generated app installs with ${pm}`);
        await checked(pm, ["run", "build"], project, { CI: "true" });
        assert(await viewerRpcId(project), "generated build exposes its actual getViewer RPC ID");
        const emitted = JSON.parse(
          await readFile(join(project, "dist/server/wrangler.json"), "utf8"),
        );
        assert.equal(emitted.observability.redact_query_string, true);
        assert.equal(emitted.assets.not_found_handling, "single-page-application");
        assert.deepEqual(emitted.assets.run_worker_first, [
          "/api/*",
          "/_serverFn/*",
          "/admin/enter",
        ]);
        assert.equal(typeof emitted.assets.directory, "string");
        assert(emitted.assets.directory.length > 0, "generated build declares its client assets");
        const shell = await readFile(join(project, "dist/client/index.html"), "utf8");
        assert(/<!doctype html>/i.test(shell), "generated build emits the static HTML shell");
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
