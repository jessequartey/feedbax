import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, test } from "vite-plus/test";
import { buildTemplate, findForbiddenImports } from "../../scripts/package-template.ts";

const scratch = mkdtempSync(join(tmpdir(), "feedbax-template-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("scripts/package-template.ts", () => {
  const result = buildTemplate({ out: join(scratch, "template") });
  const has = (path: string) => result.files.includes(path);
  const pkg = JSON.parse(readFileSync(join(result.out, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    overrides: Record<string, string>;
    pnpm: { overrides: Record<string, string> };
    devEngines?: unknown;
  };

  test("copies the allowlist", () => {
    for (const path of [
      "src/server.ts",
      "src/contracts/config.ts",
      "src/db/schema.ts",
      "migrations/0000_initial.sql",
      "public/favicon.svg",
      "vite.config.ts",
      "tsconfig.json",
      "components.json",
      "wrangler.jsonc",
      "feedbax.config.ts",
      ".dev.vars.example",
      ".gitignore",
      "LICENSE",
      "README.md",
      "package.json",
    ]) {
      expect(has(path), path).toBe(true);
    }
  });

  test("never copies tests, registry, CLI, scripts, workflows, drizzle-kit config or secrets", () => {
    const forbidden =
      /^(tests|registry|packages|scripts|\.github|\.template|node_modules|dist|\.wrangler|public\/r)(\/|$)/;
    expect(result.files.filter((f) => forbidden.test(f))).toEqual([]);
    for (const path of [
      "registry.json",
      "drizzle.config.ts",
      ".dev.vars",
      "package-lock.json",
      ".node-version",
    ]) {
      expect(has(path), path).toBe(false);
    }
  });

  test("README comes from .template/README.md", () => {
    expect(readFileSync(join(result.out, "README.md"), "utf8")).toBe(
      readFileSync(new URL("../../.template/README.md", import.meta.url), "utf8"),
    );
  });

  test("package.json keeps only the app's scripts and dependencies", () => {
    expect(Object.keys(pkg.scripts)).toEqual(["dev", "build", "deploy", "check", "cf-typegen"]);
    expect(pkg.scripts.deploy).toBe(
      "vp build && wrangler d1 migrations apply DB --remote && wrangler deploy",
    );
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const name of ["drizzle-kit", "modern-screenshot", "@clack/prompts"])
      expect(all[name]).toBeUndefined();
    for (const name of [
      "drizzle-orm",
      "better-auth",
      "@tanstack/react-start",
      "wrangler",
      "vite-plus",
    ]) {
      expect(all[name], name).toBeDefined();
    }
    expect(pkg.overrides.vite).toBe("npm:@voidzero-dev/vite-plus-core@1.6.0");
    expect(pkg.pnpm.overrides.vite).toBe("npm:@voidzero-dev/vite-plus-core@1.6.0");
    expect(pkg.devEngines).toBeUndefined();
  });

  test("forbidden-import guard flags tests/scripts/registry imports", () => {
    const dir = join(scratch, "guard");
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(
      join(dir, "src", "bad.ts"),
      'import { x } from "../../tests/fixtures/portal.ts";\n',
    );
    writeFileSync(join(dir, "src", "good.ts"), 'import { y } from "./other.ts";\n');
    expect(findForbiddenImports(dir)).toEqual(["src/bad.ts"]);
  });

  test("only the W0 server-function stub reaches into tests/ (W1 removes it)", () => {
    expect(result.forbiddenImports.filter((f) => f !== "src/server/functions.ts")).toEqual([]);
  });
});
