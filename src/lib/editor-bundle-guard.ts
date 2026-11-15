// Run in the existing build check, against emitted chunks (not source import spelling).
import { gzipSync } from "node:zlib";
import type { Plugin } from "vite-plus";

export function editorBundleGuard(): Plugin {
  return {
    name: "feedbax-editor-bundle-guard",
    apply: "build",
    writeBundle(_options, bundle) {
      if (this.environment.name !== "client") return;
      const chunks = Object.values(bundle).filter((chunk) => chunk.type === "chunk");
      const postRoutes = chunks.filter((chunk) =>
        chunk.moduleIds.some((id) => /\/routes\/_portal(?:\.posts\.\$postId)?\.tsx/.test(id)),
      );
      if (
        !postRoutes.some((chunk) =>
          chunk.moduleIds.some((id) => /\/routes\/_portal\.posts\.\$postId\.tsx/.test(id)),
        )
      ) {
        this.error("Post route missing from client bundle");
      }
      // Include the app entry and portal layout too: shared code can pull the writer into either.
      const reading = new Set<string>();
      const visit = (file: string) => {
        if (reading.has(file)) return;
        reading.add(file);
        const chunk = bundle[file];
        if (chunk?.type === "chunk") chunk.imports.forEach(visit);
      };
      chunks.filter((chunk) => chunk.isEntry).forEach((chunk) => visit(chunk.fileName));
      postRoutes.forEach((chunk) => visit(chunk.fileName));
      let raw = 0;
      let gzip = 0;
      for (const file of reading) {
        const chunk = bundle[file];
        if (chunk?.type !== "chunk") continue;
        const forbidden = Object.entries(chunk.modules).filter(
          ([id, info]) =>
            info.renderedLength > 0 &&
            /(?:\/components\/admin\/changelog\.|\/rich-text-(?:editor|doc)\.|\/markdown-write\.|\/@tiptap\/|\/prosemirror-)/.test(
              id,
            ),
        );
        if (forbidden.length) {
          this.error(
            `Reading a post includes editor code in ${file}: ${forbidden.map(([id]) => id).join(", ")}`,
          );
        }
        raw += Buffer.byteLength(chunk.code);
        gzip += gzipSync(chunk.code).length;
        const metadata = chunk as typeof chunk & { viteMetadata?: { importedCss?: Set<string> } };
        for (const css of metadata.viteMetadata?.importedCss ?? []) {
          const asset = bundle[css];
          if (asset?.type === "asset" && /feedbax-editor|ProseMirror/.test(String(asset.source))) {
            this.error(`Reading a post includes editor CSS in ${css}`);
          }
        }
      }
      this.info(
        `Post reading graph: ${reading.size} chunks; ${raw} bytes raw / ${gzip} bytes gzip; no editor, writer or editor CSS`,
      );
    },
  };
}
