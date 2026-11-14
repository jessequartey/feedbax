import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { main } from "../../packages/feedbax/src/index.ts";
import { ensureRunWorkerFirst } from "../../packages/feedbax/src/jsonc-edit.ts";
import { applyPlan, planUpgrade } from "../../packages/feedbax/src/merge.ts";
import { extractTemplate } from "../../packages/feedbax/src/registry.ts";
import { compareVersions, detectVersion } from "../../packages/feedbax/src/version.ts";
import { scripted } from "./fakes.ts";
import {
  cleanup,
  commitAll,
  configSource,
  fakeRegistry,
  fakeWrangler,
  git,
  project,
  REGISTRY,
  tarball,
  template,
  wranglerJson,
} from "./feedbax-helpers.ts";

afterEach(cleanup);

const lines = (...values: string[]) => `${values.join("\n")}\n`;
const read = (cwd: string, path: string) => readFile(join(cwd, path), "utf8");

describe("3-way merge", () => {
  const base = template("0.3.0", {
    "src/clean.ts": lines("a", "b", "c"),
    "src/user-only.ts": lines("a", "b", "c"),
    "src/upstream-only.ts": lines("a", "b", "c"),
    "src/both.ts": lines("one", "two", "three", "four", "five", "six", "seven"),
    "src/conflict.ts": lines("a", "b", "c"),
    "src/removed.ts": lines("old"),
    "src/removed-edited.ts": lines("old"),
    "feedbax.config.ts": configSource(),
    "wrangler.jsonc": wranglerJson(),
  });
  const next = template("0.4.0", {
    "src/clean.ts": lines("a", "b", "c"),
    "src/user-only.ts": lines("a", "b", "c"),
    "src/upstream-only.ts": lines("a", "B", "c"),
    "src/both.ts": lines("one", "two", "three", "four", "five", "six", "SEVEN"),
    "src/conflict.ts": lines("a", "upstream", "c"),
    "src/added.ts": lines("new"),
    "migrations/0005_admin_foundation.sql": "CREATE TABLE x (id TEXT);\n",
    "feedbax.config.ts": configSource().replace("showcase: false,", "showcase: false, notify: 1,"),
    "wrangler.jsonc": wranglerJson(["/api/*", "/_serverFn/*", "/admin/enter"]),
  });
  const userFiles = {
    "src/clean.ts": lines("a", "b", "c"),
    "src/user-only.ts": lines("a", "mine", "c"),
    "src/upstream-only.ts": lines("a", "b", "c"),
    "src/both.ts": lines("ONE", "two", "three", "four", "five", "six", "seven"),
    "src/conflict.ts": lines("a", "mine", "c"),
    "src/removed.ts": lines("old"),
    "src/removed-edited.ts": lines("old", "mine"),
  };

  it("classifies and applies every case", async () => {
    const cwd = await project(userFiles);
    const plan = await planUpgrade({ cwd, baseline: base, target: next });
    const kinds = Object.fromEntries(plan.actions.map((a) => [a.path, a.kind]));
    expect(kinds).toEqual({
      "feedbax.config.ts": "protected",
      "migrations/0005_admin_foundation.sql": "add",
      "package.json": "update",
      "src/added.ts": "add",
      "src/both.ts": "merge",
      "src/conflict.ts": "conflict",
      "src/removed-edited.ts": "conflict",
      "src/removed.ts": "delete",
      "src/upstream-only.ts": "update",
      "wrangler.jsonc": "structural",
    });
    expect(plan.migrations).toEqual(["migrations/0005_admin_foundation.sql"]);

    const before = {
      config: await read(cwd, "feedbax.config.ts"),
      vars: await read(cwd, ".dev.vars"),
    };
    await applyPlan(cwd, plan);
    expect(await read(cwd, "src/clean.ts")).toBe(lines("a", "b", "c"));
    expect(await read(cwd, "src/user-only.ts")).toBe(lines("a", "mine", "c"));
    expect(await read(cwd, "src/upstream-only.ts")).toBe(lines("a", "B", "c"));
    expect(await read(cwd, "src/both.ts")).toBe(
      lines("ONE", "two", "three", "four", "five", "six", "SEVEN"),
    );
    expect(await read(cwd, "src/conflict.ts")).toBe(
      lines(
        "a",
        "<<<<<<< your project",
        "mine",
        "=======",
        "upstream",
        ">>>>>>> feedbax 0.4.0",
        "c",
      ),
    );
    expect(await read(cwd, "src/added.ts")).toBe(lines("new"));
    await expect(read(cwd, "src/removed.ts")).rejects.toThrow();
    expect(await read(cwd, "src/removed-edited.ts")).toBe(lines("old", "mine"));
    // package.json: upstream version bump applied, the scaffolded project name kept.
    expect(JSON.parse(await read(cwd, "package.json"))).toMatchObject({
      name: "my-feedback",
      version: "0.4.0",
    });
    // Protected: config and secrets untouched; wrangler.jsonc only gets the structural edit.
    expect(await read(cwd, "feedbax.config.ts")).toBe(before.config);
    expect(await read(cwd, ".dev.vars")).toBe(before.vars);
    const wrangler = JSON.parse(await read(cwd, "wrangler.jsonc"));
    expect(wrangler.assets.run_worker_first).toEqual([
      "/api/*",
      "/_serverFn/*",
      "/admin/enter",
      "/changelog.rss",
    ]);
    expect(wrangler.d1_databases[0].database_id).toBe("12345678-1234-4234-8234-123456789abc");
    expect(wrangler.vars.PORTAL_URL).toBe("https://my-feedback.team.workers.dev");
  });

  it("never reads or writes .dev.vars, .feedbax or node_modules from a template", async () => {
    const cwd = await project();
    const plan = await planUpgrade({
      cwd,
      baseline: template("0.3.0", {}),
      target: template("0.3.0", {
        ".dev.vars": "NOTION_TOKEN=x\n",
        ".feedbax/version": "9.9.9\n",
        "node_modules/x/index.js": "x",
      }),
    });
    expect(plan.actions).toEqual([]);
  });

  it("reads the template from an npm tarball and restores .gitignore", () => {
    const files = extractTemplate(tarball(template("0.4.0", { ".gitignore": "dist\n" })));
    expect([...files.keys()].sort()).toEqual([".gitignore", "package.json"]);
  });
});

describe("wrangler.jsonc run_worker_first", () => {
  it("adds /admin/enter to a generated (JSON) file, keeping everything else, idempotently", () => {
    const before = wranglerJson();
    const once = ensureRunWorkerFirst(before, "/admin/enter");
    expect(JSON.parse(once)).toEqual({
      ...JSON.parse(before),
      assets: {
        not_found_handling: "single-page-application",
        run_worker_first: ["/api/*", "/_serverFn/*", "/admin/enter"],
      },
    });
    expect(once).toContain('      "/_serverFn/*",\n      "/admin/enter"\n    ]');
    expect(ensureRunWorkerFirst(once, "/admin/enter")).toBe(once);
  });

  it("edits a commented JSONC file with a trailing comma in place", () => {
    const before = `{
  // keep me
  "assets": {
    "run_worker_first": ["/api/*", "/_serverFn/*"], // routes
  },
  "vars": { "PORTAL_URL": "https://x.example" /* keep */ },
}
`;
    const after = ensureRunWorkerFirst(before, "/admin/enter");
    expect(after).toBe(before.replace('"/_serverFn/*"]', '"/_serverFn/*", "/admin/enter"]'));
    expect(ensureRunWorkerFirst(after, "/admin/enter")).toBe(after);
  });

  it("adds /changelog.rss the same way, after /admin/enter, idempotently", () => {
    const edit = (text: string) =>
      ensureRunWorkerFirst(ensureRunWorkerFirst(text, "/admin/enter"), "/changelog.rss");
    // 0.3.0 file: neither route yet. A 0.4.0 pre-release file: only /admin/enter.
    for (const routes of [
      ["/api/*", "/_serverFn/*"],
      ["/api/*", "/_serverFn/*", "/admin/enter"],
    ]) {
      const once = edit(wranglerJson(routes));
      expect(JSON.parse(once).assets.run_worker_first).toEqual([
        "/api/*",
        "/_serverFn/*",
        "/admin/enter",
        "/changelog.rss",
      ]);
      expect(edit(once)).toBe(once);
    }
    const commented = `{
  // keep me
  "assets": {
    "run_worker_first": ["/api/*", "/_serverFn/*", "/admin/enter"], // routes
  },
}
`;
    const after = edit(commented);
    expect(after).toBe(commented.replace('"/admin/enter"]', '"/admin/enter", "/changelog.rss"]'));
    expect(edit(after)).toBe(after);
  });

  it("leaves run_worker_first: true alone", () => {
    const text = '{ "assets": { "run_worker_first": true } }';
    expect(ensureRunWorkerFirst(text, "/admin/enter")).toBe(text);
  });
});

describe("version detection", () => {
  const published = ["0.2.2", "0.3.0", "0.4.0"];
  it("prefers .feedbax/version", async () => {
    const cwd = await project({ ".feedbax/version": "0.4.0\n" });
    expect(await detectVersion(cwd, published)).toEqual({ version: "0.4.0", source: "recorded" });
  });
  it("uses a published package.json version (0.3.0 projects keep the template's)", async () => {
    const cwd = await project();
    expect(await detectVersion(cwd, published)).toEqual({
      version: "0.3.0",
      source: "package.json",
    });
  });
  it("falls back to the 0.3.0 migrations fingerprint", async () => {
    const cwd = await project({
      "package.json": '{ "name": "my-feedback", "version": "1.2.3" }\n',
      "migrations/0000_initial.sql": "",
      "migrations/0004_github_creator.sql": "",
    });
    expect(await detectVersion(cwd, published)).toEqual({
      version: "0.3.0",
      source: "fingerprint",
    });
  });
  it("refuses 0.2.x and unknown projects", async () => {
    const old = await project({ "src/feedbax.ts": "", "package.json": "{}\n" });
    await rm(join(old, "src/contracts/config.ts"));
    await expect(detectVersion(old, published)).rejects.toThrow("0.2.x");
    const unknown = await project({ "package.json": '{ "version": "7.0.0" }\n' });
    await expect(detectVersion(unknown, published)).rejects.toThrow("--baseline");
  });
  it("orders versions", () => {
    expect(compareVersions("0.4.0", "0.3.0")).toBe(1);
    expect(compareVersions("0.10.0", "0.9.9")).toBe(1);
    expect(compareVersions("0.4.0-rc.1", "0.4.0")).toBe(-1);
    expect(compareVersions("0.4.0", "0.4.0")).toBe(0);
  });
});

describe("feedbax migrate", () => {
  const base = template("0.3.0", {
    "src/server.ts": lines("export const v = 3;"),
    "migrations/0004_github_creator.sql": "SELECT 4;\n",
    "feedbax.config.ts": configSource(),
    "wrangler.jsonc": wranglerJson(),
  });
  const next = template("0.4.0", {
    "src/server.ts": lines("export const v = 4;"),
    "migrations/0004_github_creator.sql": "SELECT 4;\n",
    "migrations/0005_admin_foundation.sql": "SELECT 5;\n",
    "feedbax.config.ts": configSource(),
    "wrangler.jsonc": wranglerJson(["/api/*", "/_serverFn/*", "/admin/enter", "/changelog.rss"]),
  });
  const files = {
    "src/server.ts": lines("export const v = 3;"),
    "migrations/0004_github_creator.sql": "SELECT 4;\n",
  };
  const deps = (cwd: string) => {
    const registry = fakeRegistry([base, next]);
    const wrangler = fakeWrangler();
    const prompt = scripted();
    return {
      registry,
      wrangler,
      prompt,
      deps: {
        cwd,
        env: { npm_config_registry: REGISTRY },
        fetch: registry.fetch,
        run: wrangler.run,
        prompt,
        interactive: false,
        log: () => {},
      },
    };
  };

  it("refuses a dirty tree (and a non-Git folder) unless --force, before any download", async () => {
    const cwd = await project(files, { git: true });
    await writeFile(join(cwd, "src/server.ts"), "// local edit\n");
    const dirty = deps(cwd);
    expect(await main(["migrate", "--yes"], dirty.deps)).toBe(2);
    expect(dirty.prompt.log.join("\n")).toContain("Commit or stash your changes first");
    expect(dirty.registry.requests).toEqual([]);
    expect(dirty.wrangler.calls).toEqual([]);

    const loose = await project(files);
    const noGit = deps(loose);
    expect(await main(["migrate", "--yes"], noGit.deps)).toBe(2);
    expect(noGit.prompt.log.join("\n")).toContain("not in a Git repository");

    const forced = deps(loose);
    expect(await main(["migrate", "--yes", "--force"], forced.deps)).toBe(0);
  });

  it("--dry-run prints the plan and changes nothing", async () => {
    const cwd = await project(files, { git: true });
    const run = deps(cwd);
    expect(await main(["migrate", "--dry-run"], run.deps)).toBe(0);
    const output = run.prompt.log.join("\n");
    expect(output).toContain("Project is on 0.3.0 (from package.json version); target is 0.4.0.");
    expect(output).toContain("~ update   src/server.ts");
    expect(output).toContain("+ add      migrations/0005_admin_foundation.sql");
    expect(output).toContain('~ edit     wrangler.jsonc  (add "/admin/enter"');
    expect(output).toContain("0005_admin_foundation.sql");
    expect(git(cwd, "status", "--porcelain")).toBe("");
    expect(run.wrangler.calls).toEqual([]);
  });

  it("upgrades 0.3.0 → latest: source, version file, install, migrations, deploy", async () => {
    const cwd = await project(files, { git: true });
    const run = deps(cwd);
    expect(await main(["migrate", "--yes"], run.deps)).toBe(0);
    expect(await read(cwd, "src/server.ts")).toBe(lines("export const v = 4;"));
    expect(await read(cwd, "migrations/0005_admin_foundation.sql")).toBe("SELECT 5;\n");
    expect(await read(cwd, ".feedbax/version")).toBe("0.4.0\n");
    expect(JSON.parse(await read(cwd, "wrangler.jsonc")).assets.run_worker_first).toEqual([
      "/api/*",
      "/_serverFn/*",
      "/admin/enter",
      "/changelog.rss",
    ]);
    expect(run.wrangler.calls).toEqual([
      "npm install",
      "wrangler d1 migrations apply DB --remote",
      "npm run build",
      "wrangler deploy",
    ]);
    // Rerunning is a no-op: the recorded version is the target.
    const again = deps(cwd);
    expect(await main(["migrate", "--yes", "--force"], again.deps)).toBe(0);
    expect(again.prompt.log.join("\n")).toContain("Already on 0.4.0");
  });

  it("stops after writing conflict markers, before install, migrations and deploy", async () => {
    const cwd = await project(
      { ...files, "src/server.ts": lines("export const v = 33;") },
      { git: true },
    );
    const run = deps(cwd);
    expect(await main(["migrate", "0.4.0", "--yes"], run.deps)).toBe(1);
    expect(await read(cwd, "src/server.ts")).toContain("<<<<<<< your project");
    expect(run.prompt.log.join("\n")).toContain("src/server.ts: conflict markers written");
    expect(run.wrangler.calls).toEqual([]);
    expect(await read(cwd, ".feedbax/version")).toBe("0.4.0\n");
  });

  it("refuses downgrades and unknown targets", async () => {
    const cwd = await project(files, { git: true });
    await mkdir(join(cwd, ".feedbax"));
    await writeFile(join(cwd, ".feedbax/version"), "0.4.0\n");
    commitAll(cwd);
    const down = deps(cwd);
    expect(await main(["migrate", "0.3.0", "--yes"], down.deps)).toBe(2);
    expect(down.prompt.log.join("\n")).toContain("Downgrading");
    const missing = deps(cwd);
    expect(await main(["migrate", "9.9.9", "--yes"], missing.deps)).toBe(2);
  });
});
