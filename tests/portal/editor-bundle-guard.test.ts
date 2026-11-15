import { describe, expect, it, vi } from "vite-plus/test";
import { editorBundleGuard } from "../../scripts/editor-bundle-guard.ts";

// Exercise the emitted graph contract, including shared imports and separately loaded CSS.
function check({
  eager = false,
  module = "/src/components/portal/rich-text-editor.tsx",
  css = false,
} = {}) {
  const chunk = (fileName: string, moduleId: string, imports: string[] = []) => ({
    type: "chunk",
    fileName,
    moduleIds: [moduleId],
    modules: { [moduleId]: { renderedLength: 10 } },
    imports,
    code: "export {};",
  });
  const bundle = {
    "post.js": chunk("post.js", "/src/routes/_portal.posts.$postId.tsx", ["shared.js"]),
    "shared.js": {
      ...chunk("shared.js", "/src/shared.ts", eager ? ["writer.js"] : []),
      dynamicImports: ["writer.js"],
      viteMetadata: { importedCss: new Set(css ? ["writer.css"] : []) },
    },
    "writer.js": chunk("writer.js", module),
    "writer.css": { type: "asset", source: ".feedbax-editor .ProseMirror {}" },
  };
  const plugin = editorBundleGuard();
  const hook = plugin.writeBundle;
  if (typeof hook !== "function") throw new Error("Expected a build hook");
  void hook.call(
    {
      environment: { name: "client" },
      error: (message: string) => {
        throw new Error(message);
      },
      info: vi.fn(),
    } as unknown as ThisParameterType<typeof hook>,
    {} as Parameters<typeof hook>[0],
    bundle as unknown as Parameters<typeof hook>[1],
  );
}

describe("post reading bundle guard", () => {
  it("allows a dynamically imported editor", () => expect(() => check()).not.toThrow());

  it.each([
    "/src/components/portal/rich-text-editor.tsx",
    "/src/components/portal/rich-text-doc.ts",
    "/src/lib/markdown-write.ts",
    "/node_modules/@tiptap/core/dist/index.js",
    "/node_modules/prosemirror-view/dist/index.js",
    "/src/components/admin/changelog.tsx",
  ])("rejects a shared eager import of %s", (module) => {
    expect(() => check({ eager: true, module })).toThrow("Reading a post includes editor code");
  });

  it("rejects editor CSS on a shared eager chunk", () => {
    expect(() => check({ css: true })).toThrow("Reading a post includes editor CSS");
  });
});
