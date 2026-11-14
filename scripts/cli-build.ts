// Node 24 type stripping; only erasable TypeScript.
import { chmod, copyFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildTemplate } from "./package-template.ts";
import { createRunner } from "../packages/create-feedbax/src/io.ts";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
async function pack(cwd: string, entry: string, clean: boolean): Promise<void> {
  const run = createRunner();
  const args = ["pack", entry, "--no-config", "--format", "esm", "--target", "node24"];
  args.push("--out-dir", "dist", ...(clean ? [] : ["--no-clean"]));
  const packed = await run(join(root, "node_modules/.bin/vp"), args, { cwd });
  if (packed.code) throw new Error(packed.stderr || packed.stdout);
}
/** Build a CLI package: dist/index.mjs plus dist/providers.mjs (the real setup clients). */
async function buildPackage(name: string): Promise<string> {
  const cwd = join(root, "packages", name);
  await pack(cwd, "src/index.ts", true);
  await chmod(join(cwd, "dist/index.mjs"), 0o755);
  // Bundle the real provisioning clients (src/integrations) so neither CLI carries a
  // second Notion or GitHub implementation.
  const entry = join(cwd, "provider-entry.ts");
  try {
    await writeFile(
      entry,
      'export { createNotionSetupClient } from "../../src/integrations/notion.ts";\nexport { createGitHubSetupClient } from "../../src/integrations/github.ts";\n',
    );
    await pack(cwd, "provider-entry.ts", false);
    await copyFile(join(cwd, "dist/provider-entry.mjs"), join(cwd, "dist/providers.mjs"));
    await rm(join(cwd, "dist/provider-entry.mjs"));
  } finally {
    await rm(entry, { force: true });
  }
  await copyFile(join(root, "LICENSE"), join(cwd, "LICENSE"));
  return cwd;
}
export async function buildCli(): Promise<void> {
  // feedbax shares create-feedbax's modules at build time: its src imports them from
  // ../../create-feedbax/src and the bundler inlines them.
  await Promise.all([buildPackage("create-feedbax"), buildPackage("feedbax")]);
  const template = buildTemplate();
  // npm always omits .gitignore, including nested ones. Transport the exact
  // allowlisted file under a neutral name, then restore it when scaffolding.
  await copyFile(join(template.out, ".gitignore"), join(template.out, "_gitignore"));
  if (template.forbiddenImports.length)
    throw new Error(`Template imports repo-only fixtures: ${template.forbiddenImports.join(", ")}`);
  console.log(`create-feedbax + feedbax: built CLIs + ${template.files.length} template files`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await buildCli();
