// `npm run registry:build`: shadcn build + schema validation (spec §13).
//   node scripts/build-registry.ts
// Reads registry.json, writes public/r/*.json (committed), then validates the registry and
// every built item with shadcn's own zod schemas. Erasable TypeScript only.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { registryItemSchema, registrySchema } from "shadcn/schema";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const registryFile = join(ROOT, "registry.json");
const outDir = join(ROOT, "public", "r");

if (!existsSync(registryFile)) {
  console.error("error: registry.json not found");
  process.exit(1);
}

const registry = registrySchema.parse(JSON.parse(readFileSync(registryFile, "utf8")));

const build = spawnSync(
  "npx",
  ["--no-install", "shadcn", "build", "registry.json", "--output", "public/r"],
  {
    cwd: ROOT,
    stdio: ["ignore", "inherit", "inherit"],
  },
);
if (build.status !== 0) process.exit(build.status ?? 1);

const built = existsSync(outDir)
  ? readdirSync(outDir).filter((name) => name.endsWith(".json"))
  : [];
const expected = new Set(registry.items.map((item) => `${item.name}.json`));
const problems: string[] = [];
for (const name of expected) if (!built.includes(name)) problems.push(`missing public/r/${name}`);
for (const name of built) {
  if (name === "registry.json") continue;
  const parsed = registryItemSchema.safeParse(JSON.parse(readFileSync(join(outDir, name), "utf8")));
  if (!parsed.success)
    problems.push(`public/r/${name}: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  else if (
    !parsed.data.files?.every((file) => typeof file.content === "string" && file.content.length > 0)
  ) {
    problems.push(`public/r/${name}: a file has no embedded content`);
  }
}
if (problems.length > 0) {
  console.error(problems.map((p) => `error: ${p}`).join("\n"));
  process.exit(1);
}
console.log(`registry: ${registry.items.length} item(s) built and validated`);
