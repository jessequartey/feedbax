import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const packageEntry = (name: string) =>
  fileURLToPath(new URL(`./packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@/components/ui": fileURLToPath(
        new URL("./packages/ui/src/components", import.meta.url),
      ),
      "@feedbax/changelog": packageEntry("changelog"),
      "@feedbax/config": packageEntry("config"),
      "@feedbax/feedback": packageEntry("feedback"),
      "cloudflare:workers": fileURLToPath(
        new URL(
          "./apps/portal/src/cloudflare-workers-test.ts",
          import.meta.url,
        ),
      ),
    },
  },
  test: {
    exclude: ["**/node_modules/**", "packages/create-feedbax/template/**"],
  },
});
