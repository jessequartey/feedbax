import { fileURLToPath } from "node:url";
import { defineConfig, lazyPlugins } from "vite-plus";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";

// Tests run in plain Node: the Cloudflare and TanStack Start plugins are only for dev/build.
const testing = Boolean(process.env.VITEST);

const GENERATED = [
  "src/routeTree.gen.ts",
  "src/components/ui/**",
  "src/styles.css",
  "src/lib/utils.ts",
  "src/db/auth-schema.ts",
  "worker-configuration.d.ts",
  "public/r/**",
  "dist/**",
  "packages/**/template/**",
];

const config = defineConfig({
  // Generated or shadcn-managed files are never reformatted: `shadcn apply` and the
  // generators rewrite them, and hand edits would be lost (spec §14).
  fmt: { ignorePatterns: GENERATED },
  lint: {
    ignorePatterns: GENERATED,
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  resolve: { tsconfigPaths: true },
  plugins: testing
    ? []
    : lazyPlugins(() => [
        cloudflare({ viteEnvironment: { name: "ssr" } }),

        tanstackStart({
          spa: { enabled: true, prerender: { outputPath: "/index" } },
          prerender: { autoStaticPathsDiscovery: false },
        }),
        viteReact(),
        tailwindcss(),
      ]),
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx", "packages/**/*.test.ts"],
    alias: {
      "cloudflare:workers": fileURLToPath(
        new URL("./tests/fixtures/cloudflare-workers.ts", import.meta.url),
      ),
    },
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});

export default config;
