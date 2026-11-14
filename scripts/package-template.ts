// Builds the generated-project template that create-feedbax embeds (spec §3).
//   node scripts/package-template.ts [--out <dir>] [--strict]
// Copies an ALLOWLIST from the repo root, replaces the README, rewrites package.json.
// Never copied: tests, registry, CLI source, scripts, workflows, drizzle-kit, secrets.
// Erasable TypeScript only (runs with Node 24 type stripping).
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const DEFAULT_OUT = join(ROOT, "packages", "create-feedbax", "template");

/** Directories copied as-is (relative to the repo root). */
export const COPY_DIRS = ["src", "migrations", "public"];
/** Root files copied as-is. */
export const COPY_FILES = [
  "vite.config.ts",
  "tsconfig.json",
  "tsr.config.json",
  "components.json",
  "wrangler.jsonc",
  "feedbax.config.ts",
  "worker-configuration.d.ts",
  ".dev.vars.example",
  ".gitignore",
  "LICENSE",
];
/** Dependencies that exist only for repo work (migrations, the block, the CLI). */
export const REPO_ONLY_DEPENDENCIES = ["drizzle-kit", "modern-screenshot", "@clack/prompts"];
/** The only scripts a generated project has (spec §12). */
export const TEMPLATE_SCRIPTS = ["dev", "build", "deploy", "check", "cf-typegen"];
const VITE_ALIAS = "npm:@voidzero-dev/vite-plus-core@1.6.0";
/** Paths and packages a template file must never reach for. */
const FORBIDDEN_IMPORT =
  /(?:from|import)\s*\(?\s*["'](?:[^"']*\/)?(?:tests|scripts|registry|packages)\/|["']drizzle-kit["']/;

type Pkg = {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  scripts: Record<string, string>;
  [key: string]: unknown;
};

function pick<T>(source: Record<string, T>, keys: string[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const key of keys) if (key in source) out[key] = source[key] as T;
  return out;
}

export function templatePackageJson(root: Pkg): Record<string, unknown> {
  const devDependencies = Object.fromEntries(
    Object.entries(root.devDependencies).filter(([name]) => !REPO_ONLY_DEPENDENCIES.includes(name)),
  );
  const dependencies = Object.fromEntries(
    Object.entries(root.dependencies).filter(([name]) => !REPO_ONLY_DEPENDENCIES.includes(name)),
  );
  return {
    name: "feedbax-portal",
    version: "0.3.0",
    private: true,
    type: "module",
    imports: root.imports,
    engines: root.engines,
    scripts: pick(root.scripts, TEMPLATE_SCRIPTS),
    dependencies,
    devDependencies,
    // npm and bun read `overrides`; pnpm reads `pnpm.overrides`. No devEngines.packageManager.
    overrides: { vite: VITE_ALIAS },
    pnpm: {
      overrides: { vite: VITE_ALIAS },
      onlyBuiltDependencies: ["esbuild", "lightningcss", "sharp", "workerd"],
    },
  };
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

/** Template files that import tests, scripts, the registry or the CLI . */
export function findForbiddenImports(outDir: string): string[] {
  return walk(join(outDir, "src"))
    .filter((file) => /\.(?:ts|tsx)$/.test(file))
    .filter((file) => FORBIDDEN_IMPORT.test(readFileSync(file, "utf8")))
    .map((file) => relative(outDir, file).split(sep).join("/"));
}

export function buildTemplate(options: { out?: string; root?: string } = {}): {
  out: string;
  files: string[];
  forbiddenImports: string[];
} {
  const root = options.root ?? ROOT;
  const out = resolve(options.out ?? DEFAULT_OUT);
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  for (const dir of COPY_DIRS) {
    cpSync(join(root, dir), join(out, dir), {
      recursive: true,
      // public/r is the generated registry output; it never ships in a generated project.
      filter: (source) => relative(join(root, "public"), source).split(sep)[0] !== "r",
    });
  }
  for (const file of COPY_FILES) cpSync(join(root, file), join(out, file));

  const readme = join(root, ".template", "README.md");
  if (!existsSync(readme)) throw new Error("Missing .template/README.md");
  cpSync(readme, join(out, "README.md"));

  const rootPackage = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Pkg;
  writeFileSync(
    join(out, "package.json"),
    `${JSON.stringify(templatePackageJson(rootPackage), null, 2)}\n`,
  );

  const files = walk(out)
    .map((file) => relative(out, file).split(sep).join("/"))
    .sort();
  return { out, files, forbiddenImports: findForbiddenImports(out) };
}

function main(): void {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  const out = outIndex >= 0 ? args[outIndex + 1] : undefined;
  const result = buildTemplate({ out });
  console.log(
    `template: ${result.files.length} files → ${relative(process.cwd(), result.out) || "."}`,
  );
  if (result.forbiddenImports.length > 0) {
    const message = `template files import tests/scripts/registry/CLI: ${result.forbiddenImports.join(", ")}`;
    if (args.includes("--strict")) {
      console.error(`error: ${message}`);
      process.exit(1);
    }
    console.warn(`warning: ${message}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
