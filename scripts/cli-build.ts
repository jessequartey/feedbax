// Node 24 type stripping; only erasable TypeScript.
import { chmod, copyFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTemplate } from "./package-template.ts";
import { createRunner } from "../packages/create-feedbax/src/io.ts";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export async function buildCli(): Promise<void> {
  const cwd = join(root, "packages/create-feedbax");
  const run = createRunner();
  const packed = await run(
    join(root, "node_modules/.bin/vp"),
    [
      "pack",
      "src/index.ts",
      "--no-config",
      "--format",
      "esm",
      "--target",
      "node24",
      "--out-dir",
      "dist",
    ],
    { cwd },
  );
  if (packed.code) throw new Error(packed.stderr || packed.stdout);
  await chmod(join(cwd, "dist/index.mjs"), 0o755);
  // Bundle the real provisioning clients (src/integrations) so the CLI never carries a
  // second Notion or GitHub implementation.
  const entry = join(cwd, "provider-entry.ts");
  try {
    await writeFile(
      entry,
      'export { createNotionSetupClient } from "../../src/integrations/notion.ts";\nexport { createGitHubSetupClient } from "../../src/integrations/github.ts";\n',
    );
    const providers = await run(
      join(root, "node_modules/.bin/vp"),
      [
        "pack",
        "provider-entry.ts",
        "--no-config",
        "--format",
        "esm",
        "--target",
        "node24",
        "--out-dir",
        "dist",
        "--no-clean",
      ],
      { cwd },
    );
    if (providers.code) throw new Error(providers.stderr || providers.stdout);
    await copyFile(join(cwd, "dist/provider-entry.mjs"), join(cwd, "dist/providers.mjs"));
    await rm(join(cwd, "dist/provider-entry.mjs"));
  } finally {
    await rm(entry, { force: true });
  }
  const template = buildTemplate();
  // npm always omits .gitignore, including nested ones. Transport the exact
  // allowlisted file under a neutral name, then restore it when scaffolding.
  await copyFile(join(template.out, ".gitignore"), join(template.out, "_gitignore"));
  if (template.forbiddenImports.length)
    throw new Error(
      `Template imports repo-only fixtures: ${template.forbiddenImports.join(", ")}`,
    );
  await copyFile(join(root, "LICENSE"), join(cwd, "LICENSE"));
  console.log(`create-feedbax: built CLI + ${template.files.length} template files`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await buildCli();
