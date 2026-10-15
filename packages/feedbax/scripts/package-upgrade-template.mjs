import { createHash } from "node:crypto";
import { readdir, readFile, lstat, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const template = new URL("../../create-feedbax/template/", import.meta.url);
const root = fileURLToPath(template);
const files = [];
async function visit(directory, prefix = "") {
  for (const name of (await readdir(directory)).sort()) {
    const path = prefix ? `${prefix}/${name}` : name;
    const absolute = join(directory, name);
    const info = await lstat(absolute);
    if (info.isDirectory()) await visit(absolute, path);
    else if (info.isFile()) {
      const bytes = await readFile(absolute);
      files.push({
        path: path.replace(
          /^\.(gitignore|npmignore|prettierignore)\.template$/,
          ".$1",
        ),
        bytes: bytes.toString("base64"),
        sha256: createHash("sha256").update(bytes).digest("hex"),
        mode: info.mode & 0o777,
      });
    } else throw Error(`Upgrade template contains a non-file: ${path}`);
  }
}
await visit(root);
const version = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
).version;
await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../dist/upgrade-template.json", import.meta.url),
  JSON.stringify({ format: 1, version, files }),
);
