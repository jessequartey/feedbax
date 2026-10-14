import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const sibling = (path: string) =>
  fileURLToPath(new URL(`../${path}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@feedbax/changelog": sibling("changelog"),
      "@feedbax/config": sibling("config"),
      "@feedbax/feedback": sibling("feedback"),
    },
  },
});
