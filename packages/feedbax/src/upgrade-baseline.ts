import { createHash, timingSafeEqual } from "node:crypto";
import { gunzipSync } from "node:zlib";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
  lstat,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { previewSourceUpgrade, type SourceUpgradePlan } from "./source-upgrade";

const archiveUrl =
  "https://registry.npmjs.org/create-feedbax/-/create-feedbax-0.2.1.tgz";
const integrity =
  "3x3UyAczn/0qU1B/9ebSm1Nwp3IqZC1fE+f6hXu6lnfWJZQZVzYY0m1dMbn2TrCdJcvSQzPHAfcvHwJYAoCN7Q==";
const maximumBytes = 32 * 1024 * 1024;
type Entry = { path: string; bytes: string; sha256: string; mode: number };
type Snapshot = { format: 1; version: string; files: Entry[] };
const sha256 = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
function validatePath(path: string) {
  if (
    !path ||
    path.includes("\\") ||
    /[\0\r\n]/u.test(path) ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw Error("Source snapshot contains an unsafe path.");
}
function validateSnapshot(snapshot: Snapshot) {
  if (
    snapshot.format !== 1 ||
    typeof snapshot.version !== "string" ||
    !Array.isArray(snapshot.files) ||
    !snapshot.files.length ||
    snapshot.files.length > 10000
  )
    throw Error("Invalid bundled source snapshot.");
  const paths = new Set<string>();
  let size = 0;
  for (const entry of snapshot.files) {
    validatePath(entry.path);
    const bytes = Buffer.from(entry.bytes, "base64");
    size += bytes.length;
    if (
      paths.has(entry.path.toLowerCase()) ||
      sha256(bytes) !== entry.sha256 ||
      !Number.isInteger(entry.mode) ||
      entry.mode < 0 ||
      entry.mode > 0o777 ||
      size > maximumBytes
    )
      throw Error("Bundled source snapshot failed integrity validation.");
    paths.add(entry.path.toLowerCase());
  }
}
async function downloadBaseline(request: typeof fetch) {
  const response = await request(archiveUrl, {
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok || !response.body)
    throw Error(
      "The exact published 0.2.1 source baseline could not be downloaded.",
    );
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4 * 1024 * 1024)
        throw Error("Published source baseline exceeds the download limit.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const compressed = Buffer.concat(chunks);
  const actual = createHash("sha512").update(compressed).digest(),
    expected = Buffer.from(integrity, "base64");
  if (!timingSafeEqual(actual, expected))
    throw Error(
      "Published source baseline failed its pinned npm integrity check.",
    );
  const tar = gunzipSync(compressed, { maxOutputLength: maximumBytes });
  const files: Entry[] = [];
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const field = (start: number, length: number) =>
      header
        .subarray(start, start + length)
        .toString("utf8")
        .replace(/\0.*$/s, "");
    const octal = (start: number, length: number) => {
      const value = field(start, length).trim();
      if (!/^[0-7]+$/.test(value))
        throw Error("Invalid published source archive header.");
      return Number.parseInt(value, 8);
    };
    const checksum = header.reduce(
      (total, byte, index) => total + (index >= 148 && index < 156 ? 32 : byte),
      0,
    );
    if (checksum !== octal(148, 8) || ![0, 48].includes(header[156]!))
      throw Error("Unsupported published source archive entry.");
    const size = octal(124, 12),
      prefix = field(345, 155),
      path = `${prefix ? `${prefix}/` : ""}${field(0, 100)}`;
    validatePath(path);
    if (offset + 512 + size > tar.length)
      throw Error("Published source archive is incomplete.");
    if (path.startsWith("package/template/")) {
      const name = path
        .slice("package/template/".length)
        .replace(/^\.(gitignore|npmignore|prettierignore)\.template$/, ".$1");
      const bytes = tar.subarray(offset + 512, offset + 512 + size);
      files.push({
        path: name,
        bytes: bytes.toString("base64"),
        sha256: sha256(bytes),
        mode: octal(100, 8) & 0o777,
      });
    }
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  const snapshot: Snapshot = { format: 1, version: "0.2.1", files };
  validateSnapshot(snapshot);
  return snapshot;
}
async function materialize(snapshot: Snapshot, root: string) {
  for (const file of snapshot.files) {
    const path = join(root, file.path);
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, Buffer.from(file.bytes, "base64"), {
      mode: file.mode,
    });
  }
}
/** Uses the exact published creator archive, never a branch checkout, as the old source. */
export async function previewPublishedSourceUpgrade(options: {
  installation: string;
  fromVersion: string;
  target?: string;
  request?: typeof fetch;
}): Promise<SourceUpgradePlan> {
  if (options.fromVersion !== "0.2.1")
    throw Error(
      "Only the exact published 0.2.1 source baseline is supported. Review other versions manually.",
    );
  try {
    const manifest = JSON.parse(
      await readFile(join(options.installation, "package.json"), "utf8"),
    );
    const config = await lstat(join(options.installation, "src/feedbax.ts"));
    const wrangler = await lstat(join(options.installation, "wrangler.jsonc"));
    if (
      manifest.private !== true ||
      !manifest.devDependencies?.feedbax ||
      !config.isFile() ||
      !wrangler.isFile()
    )
      throw Error("Required generated source files are missing.");
  } catch (error) {
    throw Error(
      "Run upgrade from a generated Feedbax Installation with package.json, src/feedbax.ts and wrangler.jsonc.",
      { cause: error },
    );
  }
  const target = JSON.parse(
    await readFile(
      options.target ?? new URL("./upgrade-template.json", import.meta.url),
      "utf8",
    ),
  ) as Snapshot;
  validateSnapshot(target);
  const baseline = await downloadBaseline(options.request ?? fetch);
  const temporary = await mkdtemp(join(tmpdir(), "feedbax-upgrade-baseline-"));
  try {
    const baselinePath = join(temporary, "baseline"),
      targetPath = join(temporary, "target");
    await Promise.all([
      materialize(baseline, baselinePath),
      materialize(target, targetPath),
    ]);
    return await previewSourceUpgrade({
      installation: options.installation,
      baseline: baselinePath,
      target: targetPath,
      fromVersion: baseline.version,
      toVersion: target.version,
    });
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
