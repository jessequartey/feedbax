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
  console.log(`Clean packed Notion installation passed: ${app}`);
  // Exercise the other supported provider from the actual npm archives. Private
  // identifiers must stay out of every browser asset, including source maps.
  const githubMarkers = [
    "private-feedback-repository-sentinel",
    "private-binding-sentinel",
    "private-service-sentinel",
    "PRIVATE_RUNTIME_SECRET_SENTINEL",
  ];
  await writeFile(
    join(app, "src/feedbax.ts"),
    `import {defineFeedbax} from "@feedbax/config"; export default defineFeedbax(${JSON.stringify(
      {
        provider: "github",
        product: {
          name: "Packed GitHub portal",
          description: "Acceptance fixture",
          logo: "/feedbax-mark.svg",
          siteUrl: "https://portal.account.workers.dev",
        },
        github: {
          installationId: githubMarkers[1],
          serviceUrl: `https://${githubMarkers[2]}.example`,
          repository: { id: 123, owner: "acme", name: githubMarkers[0] },
          botUserId: 456,
        },
        theme: { preset: "lyra-neutral" },
        features: { voting: true, comments: true, changelog: false },
        submissions: {
          moderation: "required",
          maxTitleLength: 160,
          maxDescriptionLength: 5000,
        },
        turnstile: { enabled: false },
      },
    )});\n`,
  );
  await writeFile(
    join(app, ".dev.vars"),
    "GITHUB_PAIRING_SECRET=PRIVATE_RUNTIME_SECRET_SENTINEL\n",
    { mode: 0o600 },
  );
  run("pnpm", ["type-check"], app);
  run("pnpm", ["build"], app);
  const inspectBrowserAssets = async (directory: string) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) await inspectBrowserAssets(file);
      else {
        const bytes = await readFile(file);
        if (githubMarkers.some((marker) => bytes.includes(Buffer.from(marker))))
          throw new Error(
            `GitHub private configuration leaked in browser asset: ${file}`,
          );
      }
    }
  };
  await inspectBrowserAssets(join(app, "dist/client"));
  console.log(
    "Packed GitHub installation built; browser assets/source maps exclude private configuration.",
  );
} finally {
  if (!keep) await rm(temp, { recursive: true, force: true });
  else console.log(`Retained package evidence in ${temp}`);
}
