import { readdir, readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
const assets = new URL("../apps/portal/dist/client/assets/", import.meta.url);
const files = (await readdir(assets)).filter((file) => file.endsWith(".js"));
let total = 0;
for (const file of files) {
  const bytes = gzipSync(await readFile(new URL(file, assets))).byteLength;
  total += bytes;
  if (bytes > 250 * 1024)
    throw new Error(`${file} exceeds the 250 KiB gzip chunk budget.`);
}
if (total > 400 * 1024)
  throw new Error("Portal JavaScript exceeds the 400 KiB gzip total budget.");
console.log(
  `Portal JavaScript: ${(total / 1024).toFixed(1)} KiB gzip across ${files.length} chunks (budget: 400 KiB total; 250 KiB per chunk).`,
);
