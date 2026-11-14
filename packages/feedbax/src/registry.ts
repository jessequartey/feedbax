import { createHash, timingSafeEqual } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { CliError } from "../../create-feedbax/src/flags.ts";

/** One file of a create-feedbax template, keyed by its path in a generated project. */
export type TemplateFile = { bytes: Buffer; mode: number };
export type Template = { version: string; files: Map<string, TemplateFile> };
export type Packument = {
  latest: string;
  versions: Record<string, { tarball: string; integrity: string }>;
};

const PACKAGE = "create-feedbax";
const MAX_COMPRESSED = 16 * 1024 * 1024;
const MAX_UNPACKED = 64 * 1024 * 1024;

/** The registry npm itself would use (npm scripts export npm_config_registry). */
export function registryUrl(env: Record<string, string | undefined>): string {
  const configured = env.npm_config_registry || env.NPM_CONFIG_REGISTRY;
  const url = configured || "https://registry.npmjs.org/";
  return url.endsWith("/") ? url : `${url}/`;
}

export async function fetchPackument(request: typeof fetch, registry: string): Promise<Packument> {
  let data: {
    "dist-tags"?: { latest?: string };
    versions?: Record<string, { dist?: { tarball?: string; integrity?: string } }>;
  };
  try {
    const response = await request(`${registry}${PACKAGE}`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(String(response.status));
    data = (await response.json()) as typeof data;
  } catch {
    throw new CliError(
      `Could not read ${PACKAGE} versions from ${registry}. Check your connection and retry.`,
    );
  }
  const versions: Packument["versions"] = {};
  for (const [version, meta] of Object.entries(data.versions ?? {}))
    if (meta.dist?.tarball && meta.dist.integrity?.startsWith("sha512-"))
      versions[version] = { tarball: meta.dist.tarball, integrity: meta.dist.integrity };
  const latest = data["dist-tags"]?.latest;
  if (!latest || !versions[latest])
    throw new CliError(`The registry returned no usable ${PACKAGE} versions.`);
  return { latest, versions };
}

/** Download create-feedbax@version, check its npm integrity, and return its template/. */
export async function fetchTemplate(
  request: typeof fetch,
  packument: Packument,
  version: string,
): Promise<Template> {
  const meta = packument.versions[version];
  if (!meta) throw new CliError(`${PACKAGE}@${version} is not published.`, 2);
  let compressed: Buffer;
  try {
    const response = await request(meta.tarball, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(String(response.status));
    const body = await response.arrayBuffer();
    if (body.byteLength > MAX_COMPRESSED) throw new Error("too large");
    compressed = Buffer.from(body);
  } catch {
    throw new CliError(
      `Could not download ${PACKAGE}@${version}. Check your connection and retry.`,
    );
  }
  const expected = Buffer.from(meta.integrity.slice("sha512-".length), "base64");
  const actual = createHash("sha512").update(compressed).digest();
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual))
    throw new CliError(
      `${PACKAGE}@${version} failed its npm integrity check. Nothing was changed.`,
    );
  return { version, files: extractTemplate(compressed) };
}

export function safeRelativePath(path: string): boolean {
  return (
    Boolean(path) &&
    !path.startsWith("/") &&
    !path.includes("\\") &&
    !/[\0\r\n]/.test(path) &&
    path.split("/").every((part) => part && part !== "." && part !== "..")
  );
}

/** Read `package/template/**` from an npm tarball (ustar + pax/GNU long names). */
export function extractTemplate(compressed: Buffer): Map<string, TemplateFile> {
  const tar = gunzipSync(compressed, { maxOutputLength: MAX_UNPACKED });
  const files = new Map<string, TemplateFile>();
  let longName: string | undefined;
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const text = (start: number, length: number) =>
      header
        .subarray(start, start + length)
        .toString("utf8")
        .replace(/\0.*$/s, "");
    const octal = (start: number, length: number) => {
      const value = text(start, length).trim();
      if (!/^[0-7]+$/.test(value)) throw new CliError("The template archive is malformed.");
      return Number.parseInt(value, 8);
    };
    let checksum = 0;
    for (let index = 0; index < 512; index++)
      checksum += index >= 148 && index < 156 ? 32 : header[index]!;
    if (checksum !== octal(148, 8)) throw new CliError("The template archive is malformed.");
    const size = octal(124, 12);
    const type = String.fromCharCode(header[156]!);
    const start = offset + 512;
    if (start + size > tar.length) throw new CliError("The template archive is incomplete.");
    const data = tar.subarray(start, start + size);
    offset = start + Math.ceil(size / 512) * 512;
    if (type === "x") {
      for (const record of data.toString("utf8").split("\n")) {
        const match = /^\d+ path=(.*)$/.exec(record);
        if (match) longName = match[1];
      }
      continue;
    }
    if (type === "L") {
      longName = data.toString("utf8").replace(/\0.*$/s, "");
      continue;
    }
    if (type === "g") continue;
    const prefix = text(345, 155);
    const path = longName ?? `${prefix ? `${prefix}/` : ""}${text(0, 100)}`;
    longName = undefined;
    if (type !== "0" && type !== "\0") continue;
    if (!path.startsWith("package/template/")) continue;
    let name = path.slice("package/template/".length);
    // npm drops .gitignore files, so create-feedbax ships it as _gitignore and renames it.
    if (name === "_gitignore") name = ".gitignore";
    if (!safeRelativePath(name)) throw new CliError("The template archive has an unsafe path.");
    files.set(name, { bytes: Buffer.from(data), mode: octal(100, 8) & 0o777 });
  }
  if (!files.size) throw new CliError("The package has no template.");
  return files;
}
