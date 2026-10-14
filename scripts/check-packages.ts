import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const temp = await mkdtemp(join(tmpdir(), "feedbax-packed-"));
const keep = process.argv.includes("--keep");
const run = (command: string, args: string[], cwd = root) =>
  execFileSync(command, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, CI: "true" },
  });
try {
  const archives: Record<string, string> = {};
  for (const name of ["feedbax", "create-feedbax"]) {
    const cwd = join(root, "packages", name);
    run("pnpm", ["build"], cwd);
    const [packed] = JSON.parse(
      execFileSync(
        "npm",
        ["pack", "--ignore-scripts", "--json", "--pack-destination", temp],
        { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
      ),
    );
    for (const file of packed.files) {
      if (
        /(^|\/)(\.env|\.dev\.vars)(\.|$)|(^|\/)(node_modules|\.git|\.wrangler|\.turbo)(\/|$)|\.(pem|key)$/.test(
          file.path,
        )
      )
        throw new Error(`Forbidden package path: ${name}/${file.path}`);
      if (
        !/^(dist\/|template\/|package\.json$|README\.md$|LICENSE$|CHANGELOG\.md$)/.test(
          file.path,
        )
      )
        throw new Error(`Package allowlist rejected ${name}/${file.path}`);
    }
    archives[name] = join(temp, packed.filename);
    console.log(
      `${name}: ${packed.files.length} safe files, ${packed.size} bytes packed.`,
    );
  }
  const harness = join(temp, "harness");
  run("mkdir", ["-p", harness]);
  await writeFile(
    join(harness, "package.json"),
    JSON.stringify({ private: true }),
  );
  run(
    "npm",
    ["install", "--ignore-scripts", archives["create-feedbax"]!],
    harness,
  );
  const app = join(temp, "installation");
  run(
    "node",
    [
      join(harness, "node_modules/create-feedbax/dist/cli.js"),
      app,
      "--template-only",
    ],
    harness,
  );
  const manifest = JSON.parse(
    await readFile(join(app, "package.json"), "utf8"),
  );
  manifest.devDependencies.feedbax = `file:${archives.feedbax}`;
  await writeFile(
    join(app, "package.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  if (
    (await readdir(app)).some((name) =>
      ["pnpm-workspace.yaml", "turbo.json"].includes(name),
    )
  )
    throw new Error("Generated installation contains workspace files.");
  run("pnpm", ["install", "--no-frozen-lockfile"], app);
  for (const script of [
    "type-check",
    "lint",
    "test",
    "build",
    "deploy:dry-run",
  ])
    run("pnpm", [script], app);
  run("pnpm", ["exec", "feedbax", "--version"], app);
  console.log(`Clean packed installation passed: ${app}`);
} finally {
  if (!keep) await rm(temp, { recursive: true, force: true });
  else console.log(`Retained package evidence in ${temp}`);
}
