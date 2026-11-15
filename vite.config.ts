import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, lazyPlugins } from "vite-plus";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";

import feedbax from "./feedbax.config.ts";
import { portalUrlFromWrangler } from "./src/lib/social-meta.ts";

// Tests run in plain Node: the Cloudflare and TanStack Start plugins are only for dev/build.
const testing = Boolean(process.env.VITEST);

// The document is a static prerendered shell, so the Open Graph tags are fixed at build time
// from the portal name (feedbax.config.ts) and the deployed URL (wrangler.jsonc vars.PORTAL_URL,
// which create-feedbax writes before it builds). See src/lib/social-meta.ts.
function readPortalUrl(): string {
  try {
    const file = readFileSync(new URL("./wrangler.jsonc", import.meta.url), "utf8");
    return portalUrlFromWrangler(file) ?? "";
  } catch {
    return "";
  }
}

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
  define: testing
    ? {}
    : { __FEEDBAX_SOCIAL__: JSON.stringify({ name: feedbax.name, portalUrl: readPortalUrl() }) },
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
    // Share one module graph (and one Wrangler platform proxy) per worker instead of
    // re-importing the server for every file: halves import time. Files run serially per worker.
    isolate: false,
    unstubGlobals: true,
    unstubEnvs: true,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});

export default config;
