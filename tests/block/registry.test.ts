import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, test } from "vite-plus/test";
import { TOOL_INFO, TOOLS, toolForKey } from "../../registry/feedbax-feedback/lib/annotation.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");
const registry = JSON.parse(read("registry.json")) as {
  items: Array<{
    name: string;
    registryDependencies: string[];
    dependencies: string[];
    files: Array<{ path: string; type: string; target: string }>;
  }>;
};
const item = registry.items.find((i) => i.name === "feedbax-feedback")!;

describe("registry item", () => {
  test("lists the files at the spec's targets", () => {
    expect(item.files.length).toBeGreaterThan(0);
    for (const file of item.files) {
      expect(existsSync(join(ROOT, file.path)), file.path).toBe(true);
      if (file.type === "registry:component")
        expect(file.target).toMatch(/^@components\/feedbax\/[\w-]+\.tsx$/);
      else {
        expect(file.type).toBe("registry:lib");
        expect(file.target).toMatch(/^@lib\/feedbax\/[\w.-]+\.ts$/);
      }
    }
  });

  test("ships every source file under registry/feedbax-feedback (except repo-only shims)", () => {
    const listed = new Set(item.files.map((f) => f.path));
    for (const dir of ["components", "lib"]) {
      const glob = new FolderFiles(join(ROOT, "registry/feedbax-feedback", dir));
      for (const name of glob.files())
        expect(listed.has(`registry/feedbax-feedback/${dir}/${name}`), name).toBe(true);
    }
  });

  test("declares the host primitives it uses and pins modern-screenshot to the version W0 recorded", () => {
    expect(item.registryDependencies.sort()).toEqual([
      "button",
      "dialog",
      "dropdown-menu",
      "input",
      "label",
      "textarea",
      "tooltip",
    ]);
    expect(item.dependencies).toContain("modern-screenshot@4.7.0");
    expect(JSON.parse(read("package.json")).devDependencies["modern-screenshot"]).toBe("4.7.0");
  });

  test("the built public/r JSON carries exactly the current sources", () => {
    const built = JSON.parse(read("public/r/feedbax-feedback.json")) as {
      files: Array<{ path: string; content: string; target: string }>;
      dependencies: string[];
    };
    expect(built.files.map((f) => f.path)).toEqual(item.files.map((f) => f.path));
    for (const file of built.files)
      expect(file.content, `${file.path} is stale: run npm run registry:build`).toBe(
        read(file.path),
      );
    expect(built.dependencies).toEqual(item.dependencies);
  });

  test("repo-shims.d.ts declares every installed module", () => {
    const shims = read("registry/feedbax-feedback/repo-shims.d.ts");
    for (const file of item.files) {
      const specifier = file.target
        .replace("@components/", "@/components/")
        .replace("@lib/", "@/lib/")
        .replace(/\.tsx?$/, "");
      expect(shims, specifier).toContain(`declare module "${specifier}"`);
    }
  });

  test("block files import each other with aliases shadcn can rewrite, never across folders by relative path", () => {
    for (const file of item.files) {
      const imports = ts.preProcessFile(read(file.path)).importedFiles.map((i) => i.fileName);
      for (const specifier of imports) {
        if (specifier.startsWith("../"))
          throw new Error(`${file.path} imports ${specifier} relatively`);
      }
    }
  });
});

describe("bundle hygiene", () => {
  const resolveImport = (from: string, specifier: string): string | null => {
    const base = specifier.startsWith("@/components/feedbax/")
      ? `registry/feedbax-feedback/components/${specifier.slice("@/components/feedbax/".length)}`
      : specifier.startsWith("@/lib/feedbax/")
        ? `registry/feedbax-feedback/lib/${specifier.slice("@/lib/feedbax/".length)}`
        : specifier.startsWith("./")
          ? join(dirname(from), specifier.slice(2))
          : null;
    return (
      (base && [".tsx", ".ts"].map((ext) => base + ext).find((p) => existsSync(join(ROOT, p)))) ||
      null
    );
  };
  const graph = (entry: string) => {
    const seen = new Set<string>();
    const walk = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const info = ts.preProcessFile(read(file), true, true);
      for (const { fileName } of info.importedFiles) {
        const next = resolveImport(file, fileName);
        if (next) walk(next);
      }
    };
    walk(entry);
    return seen;
  };

  for (const entry of ["feedback-dialog", "feedbax-link"]) {
    test(`${entry} never reaches token.server (it needs the host secret)`, () => {
      const files = graph(`registry/feedbax-feedback/components/${entry}.tsx`);
      expect([...files].filter((f) => f.includes("token.server"))).toEqual([]);
      expect(files.size).toBeGreaterThan(1);
    });
  }

  test("no client file mentions the host secret", () => {
    for (const file of item.files.filter((f) => !f.path.includes("token.server")))
      expect(read(file.path)).not.toMatch(/FEEDBAX_HOST_SECRET/);
  });

  test("modern-screenshot is only ever loaded on demand", () => {
    const capture = read("registry/feedbax-feedback/lib/capture.ts");
    expect(capture).toContain('import("modern-screenshot")');
    for (const file of item.files)
      expect(read(file.path)).not.toMatch(/from ["']modern-screenshot["']/);
  });
});

describe("types copied from the contracts", () => {
  const declarations = (path: string) => {
    const source = ts.createSourceFile(path, read(path), ts.ScriptTarget.ES2022, true);
    const printer = ts.createPrinter({ removeComments: true });
    const out = new Map<string, string>();
    for (const statement of source.statements) {
      const names: string[] = [];
      if (ts.isTypeAliasDeclaration(statement)) names.push(statement.name.text);
      else if (ts.isVariableStatement(statement))
        for (const d of statement.declarationList.declarations)
          names.push((d.name as ts.Identifier).text);
      else continue;
      const text = printer
        .printNode(ts.EmitHint.Unspecified, statement, source)
        .replace(/\s+/g, " ");
      for (const name of names) out.set(name, text);
    }
    return out;
  };

  test("every declaration in lib/types.ts is identical to the contract it came from", () => {
    const contracts = new Map([
      ...declarations("src/contracts/domain.ts"),
      ...declarations("src/contracts/host-token.ts"),
    ]);
    const copied = declarations("registry/feedbax-feedback/lib/types.ts");
    expect(copied.size).toBeGreaterThanOrEqual(10);
    for (const [name, text] of copied) {
      expect(contracts.has(name), `${name} does not exist in src/contracts`).toBe(true);
      expect(text, `${name} drifted from src/contracts`).toBe(contracts.get(name));
    }
  });
});

describe("annotation tools: names and shortcuts", () => {
  test("every tool has an accessible name, a unique shortcut and a hint", () => {
    const keys = TOOLS.map((t) => TOOL_INFO[t].key);
    expect(new Set(keys).size).toBe(TOOLS.length);
    expect(keys.sort().join("")).toBe("AHPRX");
    for (const tool of TOOLS) {
      expect(TOOL_INFO[tool].label.length).toBeGreaterThan(2);
      expect(TOOL_INFO[tool].hint.length).toBeGreaterThan(5);
    }
    expect(TOOL_INFO.redact.label).toBe("Hide sensitive info");
  });

  test("P A R H X pick the tools, in either case; nothing else does", () => {
    expect(toolForKey("p")).toBe("pen");
    expect(toolForKey("A")).toBe("arrow");
    expect(toolForKey("r")).toBe("rectangle");
    expect(toolForKey("h")).toBe("highlight");
    expect(toolForKey("x")).toBe("redact");
    expect(toolForKey("z")).toBeNull();
    expect(toolForKey("Enter")).toBeNull();
  });
});

/** Lists regular files in a folder (no globbing dependency). */
class FolderFiles {
  dir: string;
  constructor(dir: string) {
    this.dir = dir;
  }
  files(): string[] {
    return ts.sys
      .readDirectory(this.dir, [".ts", ".tsx"], undefined, undefined, 1)
      .map((p) => p.slice(this.dir.length + 1));
  }
}
