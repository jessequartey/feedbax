// Spec §14: no decorative background, no hard-coded colours, no Changelog. Enforced on W3's files.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vite-plus/test";

const root = join(import.meta.dirname, "../..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "api" ? [] : walk(path);
    return /\.(tsx?|css)$/.test(name) ? [path] : [];
  });
}

const files = [
  ...walk(join(root, "src/components/portal")),
  ...walk(join(root, "src/routes")).filter((f) => !f.endsWith("routeTree.gen.ts")),
  join(root, "src/router.tsx"),
  join(root, "src/lib/auth-client.ts"),
];

const read = (file: string) => readFileSync(file, "utf8");
const offenders = (pattern: RegExp) =>
  files.filter((f) => pattern.test(read(f))).map((f) => f.slice(root.length + 1));

describe("portal style rules", () => {
  it("finds the files it is supposed to check", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("has no background-image or pattern decoration", () => {
    expect(
      offenders(
        /background-image|bg-\[url|bg-gradient|bg-linear|bg-radial|plus-pattern|data:image\/svg/i,
      ),
    ).toEqual([]);
  });

  it("has no hard-coded colours", () => {
    expect(
      offenders(/#[0-9a-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color-mix)\(/i),
    ).toEqual([]);
    const palette =
      "red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone|white|black";
    expect(
      offenders(
        new RegExp(
          `\\b(?:bg|text|border|ring|fill|stroke|from|to|via|outline|divide|shadow)-(?:${palette})(?:-\\d{2,3})?(?:/\\d+)?\\b`,
        ),
      ),
    ).toEqual([]);
  });

  it("has no Changelog", () => {
    expect(offenders(/changelog/i)).toEqual([]);
  });

  it("does not import server-only layers", () => {
    expect(offenders(/from ["'](?:@|\.\.?)\/(?:.*\/)?(?:db|sync|integrations)\//)).toEqual([]);
  });
});
