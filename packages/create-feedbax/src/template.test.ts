import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assembleFlatTemplate,
  copyPackagedTemplate,
  templateChecksum,
} from "./template";

const temporary: string[] = [];
afterEach(async () =>
  Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  ),
);
async function directory() {
  const path = await mkdtemp(join(tmpdir(), "feedbax-template-"));
  temporary.push(path);
  return path;
}

describe("flat template", () => {
  it("assembles deterministic local modules and a consolidated manifest", async () => {
    const root = resolve(import.meta.dirname, "../../..");
    const first = await directory();
    const second = await directory();
    expect(await assembleFlatTemplate(root, first)).toBe(
      await assembleFlatTemplate(root, second),
    );
    const manifest = JSON.parse(
      await readFile(join(first, "package.json"), "utf8"),
    );
    expect(manifest.devDependencies.feedbax).toBe(
      JSON.parse(
        await readFile(join(root, "packages/feedbax/package.json"), "utf8"),
      ).version,
    );
    const wrangler = JSON.parse(
      await readFile(join(first, "wrangler.jsonc"), "utf8"),
    );
    expect(wrangler.name).toBe("feedbax-installation");
    expect(wrangler.routes).toBeUndefined();
    expect(wrangler.vars).toBeUndefined();
    expect(wrangler.account_id).toBeUndefined();
    const components = JSON.parse(
      await readFile(join(first, "components.json"), "utf8"),
    );
    expect(components.tailwind.css).toBe(
      "src/components/ui/styles/globals.css",
    );
    expect(manifest.devDependencies.turbo).toBeUndefined();
    expect(await readdir(join(first, "src/feedbax"))).toEqual([
      "changelog",
      "config",
      "feedback",
    ]);
    expect(await readdir(first)).not.toContain("pnpm-workspace.yaml");
    expect(await templateChecksum(first)).toBe(
      (await readFile(join(first, ".feedbax-template.sha256"), "utf8")).trim(),
    );
  });
  it("refuses a non-empty destination", async () => {
    const target = await directory();
    await writeFile(join(target, "keep.txt"), "user data");
    await expect(copyPackagedTemplate(target)).rejects.toThrow(
      "non-empty destination",
    );
  });
  it("copies an installed template from below node_modules", async () => {
    const root = resolve(import.meta.dirname, "../../..");
    const packageRoot = await directory();
    const packaged = join(
      packageRoot,
      "node_modules",
      "create-feedbax",
      "template",
    );
    await assembleFlatTemplate(root, packaged);
    const target = join(await directory(), "generated");

    await copyPackagedTemplate(target, packaged);

    expect(await readdir(target)).toContain(".gitignore");
    expect(await readdir(target)).not.toContain(".gitignore.template");
    expect(await readdir(join(target, "src/feedbax"))).toEqual([
      "changelog",
      "config",
      "feedback",
    ]);
  });
});
