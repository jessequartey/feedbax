// `npm run verify:build` (run after `npm run build`): the emitted Worker module must default
// export an object with fetch, queue and scheduled (spec §14 gate 2). `cloudflare:*` imports
// are stubbed so the bundle can be loaded in plain Node. Erasable TypeScript only.
import { register } from "node:module";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entry = resolve(ROOT, "dist", "server", "index.js");
if (!existsSync(entry)) {
  console.error("error: dist/server/index.js not found; run `npm run build` first");
  process.exit(1);
}

const stub = `
export const env = {};
export const exports = {};
export const waitUntil = () => {};
export class WorkerEntrypoint {}
export class DurableObject {}
export class WorkflowEntrypoint {}
export class RpcTarget {}
export default {};
`;
const hooks = `
export async function resolve(specifier, context, next) {
  if (specifier.startsWith("cloudflare:")) return { url: "data:text/javascript," + encodeURIComponent(${JSON.stringify(stub)}), shortCircuit: true };
  return next(specifier, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`, import.meta.url);

const mod = (await import(pathToFileURL(entry).href)) as { default?: Record<string, unknown> };
const handler = mod.default;
const missing = ["fetch", "queue", "scheduled"].filter(
  (name) => typeof handler?.[name] !== "function",
);
if (missing.length > 0) {
  console.error(`error: dist/server/index.js default export is missing: ${missing.join(", ")}`);
  process.exit(1);
}
console.log("ok: dist/server/index.js exports fetch, queue and scheduled");
