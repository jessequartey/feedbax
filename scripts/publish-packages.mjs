import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const dryRun = process.argv.includes("--dry-run");
for (const name of ["feedbax", "create-feedbax"]) {
  const cwd = new URL(`../packages/${name}/`, import.meta.url);
  const manifest = JSON.parse(
    readFileSync(new URL("package.json", cwd), "utf8"),
  );
  if (manifest.private) throw new Error(`${name} must be publishable.`);
  try {
    execFileSync(
      "npm",
      ["view", `${name}@${manifest.version}`, "version", "--json"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    console.log(`${name}@${manifest.version} is already published.`);
    continue;
  } catch (error) {
    if (!String(error.stderr).includes("E404")) throw error;
  }
  execFileSync("pnpm", ["build"], { cwd, stdio: "inherit" });
  execFileSync(
    "npm",
    [
      "publish",
      "--access",
      "public",
      ...(dryRun ? ["--dry-run"] : ["--provenance"]),
    ],
    { cwd, stdio: "inherit" },
  );
}

if (!dryRun && process.env.GITHUB_ACTIONS === "true") {
  const { version } = JSON.parse(
    readFileSync(
      new URL("../packages/feedbax/package.json", import.meta.url),
      "utf8",
    ),
  );
  try {
    execFileSync("gh", ["release", "view", `v${version}`], { stdio: "ignore" });
  } catch {
    execFileSync(
      "gh",
      [
        "release",
        "create",
        `v${version}`,
        "--target",
        process.env.GITHUB_SHA,
        "--title",
        `Feedbax ${version}`,
        "--generate-notes",
      ],
      { stdio: "inherit" },
    );
  }
}
