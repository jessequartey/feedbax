import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { fumadocsMdx } from "fumadocs-mdx/vite";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  server: { port: 3002 },
  resolve: { tsconfigPaths: true },
  plugins: [
    fumadocsMdx(),
    cloudflare({
      configPath:
        mode === "acceptance" ? "wrangler.acceptance.jsonc" : undefined,
      viteEnvironment: { name: "ssr" },
    }),
    tailwindcss(),
    tanstackStart({ server: { entry: "./server.ts" } }),
    viteReact(),
  ],
}));
