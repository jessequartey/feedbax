import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
const src = fileURLToPath(new URL("./src/", import.meta.url));
export default defineConfig({ resolve: { alias: [{ find: "@feedbax/feedback", replacement: `${src}feedbax/feedback/index.ts` }, { find: "@feedbax/changelog", replacement: `${src}feedbax/changelog/index.ts` }, { find: "@feedbax/config", replacement: `${src}feedbax/config/index.ts` }, { find: "cloudflare:workers", replacement: `${src}cloudflare-workers-test.ts` }, { find: /^@feedbax\/ui\/(.*)$/, replacement: `${src}components/ui/$1` }] } });
