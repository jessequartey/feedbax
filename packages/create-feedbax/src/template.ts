import { createHash } from "node:crypto";
import { parse } from "jsonc-parser";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ignored = ["node_modules", "dist", ".wrangler", ".dev.vars", ".env"];
export const packagedTemplateDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../template",
);

export async function assembleFlatTemplate(
  coreRoot: string,
  destination: string,
): Promise<string> {
  const target = resolve(destination);
  await rm(target, { recursive: true, force: true });
  await mkdir(join(target, "src/feedbax"), { recursive: true });
  await copy(join(coreRoot, "apps/portal/src"), join(target, "src"));
  await copy(join(coreRoot, "apps/portal/public"), join(target, "public"));
  await copy(
    join(coreRoot, "apps/portal/migrations"),
    join(target, "migrations"),
  );
  await copy(
    join(coreRoot, "docs/connected-profile.md"),
    join(target, "CONNECTED.md"),
  );
  await copy(
    join(coreRoot, "packages/create-feedbax/docs/installation-readme.md"),
    join(target, "README.md"),
  );
  await copy(
    join(coreRoot, "packages/create-feedbax/docs/installation-agents.md"),
    join(target, "AGENTS.md"),
  );
  await copy(
    join(coreRoot, "packages/feedback/src"),
    join(target, "src/feedbax/feedback"),
  );
  await copy(
    join(coreRoot, "packages/changelog/src"),
    join(target, "src/feedbax/changelog"),
  );
  await copy(
    join(coreRoot, "packages/config/src"),
    join(target, "src/feedbax/config"),
  );
  await copy(
    join(coreRoot, "packages/ui/src"),
    join(target, "src/components/ui"),
  );
  // CSS tools resolve real paths rather than Vite's workspace aliases.
  const stylesheet = join(target, "src/index.css");
  await writeFile(
    stylesheet,
    (await readFile(stylesheet, "utf8")).replace(
      '@import "@feedbax/ui/globals.css";',
      '@import "./components/ui/styles/globals.css";',
    ),
  );
  for (const name of ["vite.config.ts"])
    await copy(join(coreRoot, "apps/portal", name), join(target, name));
  const components = parse(
    await readFile(join(coreRoot, "apps/portal/components.json"), "utf8"),
  );
  components.tailwind.css = "src/index.css";
  await writeFile(
    join(target, "components.json"),
    JSON.stringify(components, null, 2) + "\n",
  );
  const wrangler = parse(
    await readFile(join(coreRoot, "apps/portal/wrangler.jsonc"), "utf8"),
  );
  delete wrangler.routes;
  delete wrangler.vars;
  delete wrangler.account_id;
  wrangler.name = "feedbax-installation";
  await writeFile(
    join(target, "wrangler.jsonc"),
    JSON.stringify(wrangler, null, 2) + "\n",
  );
  await copy(join(coreRoot, "LICENSE"), join(target, "LICENSE"));
  await copy(
    join(coreRoot, "eslint.config.mjs"),
    join(target, "eslint.config.mjs"),
  );
  await writeFile(
    join(target, "package.json"),
    JSON.stringify(await flatManifest(coreRoot), null, 2) + "\n",
  );
  await writeFile(
    join(target, "tsconfig.json"),
    JSON.stringify(flatTsconfig, null, 2) + "\n",
  );
  await writeFile(
    join(target, "vitest.config.ts"),
    'import { fileURLToPath } from "node:url";\nimport { defineConfig } from "vitest/config";\nconst src = fileURLToPath(new URL("./src/", import.meta.url));\nexport default defineConfig({ resolve: { alias: [{ find: "@feedbax/feedback", replacement: `${src}feedbax/feedback/index.ts` }, { find: "@feedbax/changelog", replacement: `${src}feedbax/changelog/index.ts` }, { find: "@feedbax/config", replacement: `${src}feedbax/config/index.ts` }, { find: "cloudflare:workers", replacement: `${src}cloudflare-workers-test.ts` }, { find: /^@feedbax\\/ui\\/(.*)$/, replacement: `${src}components/ui/$1` }] } });\n',
  );
  // Runtime configuration is a filesystem boundary: behavioral tests use an
  // explicit fixture so a supported capability opt-out does not fail unrelated
  // all-capabilities UI assertions. Doctor separately validates the real file.
  const feedbackKeys = [
    "title",
    "slug",
    "description",
    "type",
    "status",
    "published",
    "voteCount",
    "teamResponse",
    "releaseNotesUrl",
    "submitterName",
    "submitterEmail",
    "source",
    "externalId",
    "editTokenHash",
    "createdAt",
    "updatedAt",
  ];
  const changelogKeys = [
    "title",
    "slug",
    "date",
    "summary",
    "body",
    "labels",
    "image",
    "published",
    "createdAt",
    "updatedAt",
  ];
  const fixture = {
    product: {
      name: "Feedbax",
      description: "Share feedback and follow product progress.",
      logo: "/feedbax-mark.svg",
    },
    theme: { preset: "lyra-neutral" },
    notion: {
      databaseId: "test-database",
      dataSourceId: "test-feedback",
      properties: Object.fromEntries(
        feedbackKeys.map((key) => [key, `test-${key}`]),
      ),
    },
    changelog: {
      databaseId: "test-database",
      dataSourceId: "test-changelog",
      properties: Object.fromEntries(
        changelogKeys.map((key) => [key, `test-${key}`]),
      ),
    },
    features: { voting: true, comments: true, changelog: true },
    submissions: {
      moderation: "required",
      maxTitleLength: 120,
      maxDescriptionLength: 5000,
    },
    turnstile: { enabled: false },
  };
  await writeFile(
    join(target, "src/feedbax.test-fixture.ts"),
    `import { defineFeedbax } from "@feedbax/config";\n\n// prettier-ignore\nexport default defineFeedbax(${JSON.stringify(fixture, null, 2)});\n`,
  );
  await writeFile(
    join(target, "vitest.setup.ts"),
    'import { vi } from "vitest";\n\nvi.mock("./src/feedbax", () => import("./src/feedbax.test-fixture"));\n',
  );
  const testConfigPath = join(target, "vitest.config.ts");
  await writeFile(
    testConfigPath,
    (await readFile(testConfigPath, "utf8")).replace(
      "defineConfig({ resolve:",
      'defineConfig({ test: { setupFiles: ["./vitest.setup.ts"] }, resolve:',
    ),
  );
  await writeFile(
    join(target, ".gitignore.template"),
    ".dev.vars\n.env*\ndist/\n.wrangler/\n*.log\nnode_modules/\n",
  );
  await writeFile(
    join(target, ".npmignore.template"),
    ".dev.vars\n.env*\ndist/\n.wrangler/\n*.log\n",
  );
  await writeFile(
    join(target, ".prettierignore.template"),
    "pnpm-lock.yaml\nsrc/routeTree.gen.ts\ntsconfig.json\nvitest.config.ts\n",
  );
  const checksum = await templateChecksum(target);
  await writeFile(join(target, ".feedbax-template.sha256"), `${checksum}\n`);
  return checksum;
}

export async function templateChecksum(root: string): Promise<string> {
  const hash = createHash("sha256");
  for (const file of await files(root)) {
    const name = relative(root, file);
    if (name === ".feedbax-template.sha256") continue;
    hash
      .update(name)
      .update("\0")
      .update(await readFile(file))
      .update("\0");
  }
  return hash.digest("hex");
}

export async function verifyPackagedTemplate(
  coreRoot: string,
  packaged = packagedTemplateDirectory,
): Promise<void> {
  const temporary = `${packaged}.verify-${process.pid}`;
  try {
    const expected = await assembleFlatTemplate(coreRoot, temporary);
    const actual = (
      await readFile(join(packaged, ".feedbax-template.sha256"), "utf8")
    ).trim();
    if (actual !== expected || (await templateChecksum(packaged)) !== actual)
      throw new Error(
        "Packaged create-feedbax template is out of sync. Run pnpm template:sync.",
      );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function copyPackagedTemplate(
  destination: string,
  packaged = packagedTemplateDirectory,
): Promise<void> {
  const target = resolve(destination);
  await mkdir(target, { recursive: true });
  if ((await readdir(target)).length)
    throw new Error(
      `Refusing to generate into non-empty destination: ${target}`,
    );
  // The installed package normally lives below node_modules. Do not apply the
  // contributor-source exclusion filter to this already-sanitized template.
  await cp(packaged, target, { recursive: true });
  await renameIgnoreTemplates(target);
}

async function renameIgnoreTemplates(target: string) {
  const { rename } = await import("node:fs/promises");
  for (const name of [".gitignore", ".npmignore", ".prettierignore"])
    await rename(join(target, `${name}.template`), join(target, name));
}

async function flatManifest(coreRoot: string) {
  const packageFiles = [
    "apps/portal",
    "packages/ui",
    "packages/config",
    "packages/feedback",
    "packages/changelog",
  ];
  const manifests = await Promise.all(
    packageFiles.map(async (path) =>
      JSON.parse(await readFile(join(coreRoot, path, "package.json"), "utf8")),
    ),
  );
  const workspace = await readFile(
    join(coreRoot, "pnpm-workspace.yaml"),
    "utf8",
  );
  const catalog = Object.fromEntries(
    [...workspace.matchAll(/^ {2}("?[^"\s:]+"?): (.+)$/gm)].map((match) => [
      match[1]!.replaceAll('"', ""),
      match[2]!,
    ]),
  );
  const collect = (section: "dependencies" | "devDependencies") =>
    Object.fromEntries(
      manifests
        .flatMap((manifest) => Object.entries(manifest[section] ?? {}))
        .filter(([name]) => !name.startsWith("@feedbax/"))
        .map(([name, version]) => [
          name,
          version === "catalog:" ? catalog[name] : version,
        ]),
    );
  return {
    name: "feedbax-installation",
    version: JSON.parse(
      await readFile(join(coreRoot, "packages/feedbax/package.json"), "utf8"),
    ).version,
    private: true,
    type: "module",
    scripts: {
      dev: "vite dev",
      build: "vite build",
      test: "vitest run",
      "type-check": "tsr generate && tsc --noEmit",
      lint: "eslint .",
      "format:check": "prettier --check .",
      deploy: "feedbax deploy",
      "deploy:dry-run": "wrangler deploy --dry-run",
    },
    dependencies: collect("dependencies"),
    devDependencies: {
      ...collect("devDependencies"),
      "@eslint/js": "10.0.1",
      "@shadcn/lint": "0.2.1",
      "@types/node": "22.20.1",
      feedbax: JSON.parse(
        await readFile(join(coreRoot, "packages/feedbax/package.json"), "utf8"),
      ).version,
      eslint: "10.8.1",
      globals: "17.11.0",
      prettier: "3.9.6",
      "typescript-eslint": "8.67.0",
      vitest: "4.1.11",
    },
    pnpm: { onlyBuiltDependencies: ["esbuild"] },
    engines: { node: ">=22.14.0" },
    packageManager: "pnpm@10.29.3",
    license: "Apache-2.0",
  };
}

const flatTsconfig = {
  include: ["src/**/*.ts", "src/**/*.tsx"],
  compilerOptions: {
    target: "ES2022",
    jsx: "react-jsx",
    module: "ESNext",
    lib: ["ES2022", "DOM", "DOM.Iterable"],
    types: ["vite/client", "node"],
    moduleResolution: "bundler",
    allowImportingTsExtensions: true,
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    paths: {
      "@/*": ["./src/*"],
      "@feedbax/feedback": ["./src/feedbax/feedback/index.ts"],
      "@feedbax/changelog": ["./src/feedbax/changelog/index.ts"],
      "@feedbax/config": ["./src/feedbax/config/index.ts"],
      "@feedbax/ui/*": ["./src/components/ui/*"],
      "@feedbax/ui/globals.css": ["./src/components/ui/styles/globals.css"],
    },
  },
};
async function copy(from: string, to: string) {
  await cp(from, to, {
    recursive: true,
    filter: (source) => !ignored.some((entry) => source.includes(`/${entry}`)),
  });
}
async function files(root: string): Promise<string[]> {
  const entries = await readdir(root);
  const result: string[] = [];
  for (const entry of entries.sort()) {
    const path = join(root, entry);
    if ((await stat(path)).isDirectory()) result.push(...(await files(path)));
    else result.push(path);
  }
  return result;
}
