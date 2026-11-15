// Fixtures for the `feedbax` CLI tests: a generated project on disk, npm tarballs of
// templates, a fake registry and a fake Wrangler.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import type { Run } from "../../packages/create-feedbax/src/types.ts";
import type { Template } from "../../packages/feedbax/src/registry.ts";

export const PORTAL = "https://my-feedback.team.workers.dev";
export const REGISTRY = "https://registry.test/";
export const AUTH_SECRET = "a".repeat(43);
export const HOST_SECRET = Buffer.alloc(32, 7).toString("base64url");

const CONFIG_CONTRACT = new URL("../../src/contracts/config.ts", import.meta.url);

export const wranglerJson = (routes = ["/api/*", "/_serverFn/*"]) =>
  `${JSON.stringify(
    {
      $schema: "node_modules/wrangler/config-schema.json",
      name: "my-feedback",
      account_id: "account",
      main: "src/server.ts",
      assets: { not_found_handling: "single-page-application", run_worker_first: routes },
      vars: { PORTAL_URL: PORTAL },
      d1_databases: [
        {
          binding: "DB",
          database_name: "my-feedback-db",
          database_id: "12345678-1234-4234-8234-123456789abc",
          migrations_dir: "migrations",
        },
      ],
      r2_buckets: [{ binding: "IMAGES", bucket_name: "my-feedback-images" }],
      queues: {
        producers: [{ binding: "SYNC_QUEUE", queue: "my-feedback-sync" }],
        consumers: [{ queue: "my-feedback-sync", max_batch_size: 1 }],
      },
      triggers: { crons: ["*/5 * * * *"] },
    },
    null,
    2,
  )}\n`;

export const configSource = (
  github = "false",
) => `import { defineConfig } from "./src/contracts/config.ts";

export default defineConfig({
  name: "My feedback", // shown in the header
  auth: { anonymous: true },
  showcase: false,
  integrations: {
    notion: { dataSourceId: "12345678-1234-4234-8234-123456789abc" }, // filled by the CLI
    github: ${github}, // or { repo: 'owner/repo' }
  },
});
`;

const packageJson = (name: string, version: string) =>
  `${JSON.stringify(
    { name, version, private: true, scripts: { dev: "vp dev", deploy: "vp build" } },
    null,
    2,
  )}\n`;
/** package.json after create-feedbax scaffolded the template (name set). */
export const scaffoldedPackage = (version: string) => packageJson("my-feedback", version);

/** A template the way package-template.ts emits it (name feedbax-portal). */
export function template(version: string, files: Record<string, string>): Template {
  const all: Record<string, string> = {
    "package.json": packageJson("feedbax-portal", version),
    ...files,
  };
  return {
    version,
    files: new Map(
      Object.entries(all).map(([path, text]) => [path, { bytes: Buffer.from(text), mode: 0o644 }]),
    ),
  };
}

/** A gzipped ustar archive, like the one npm publishes (package/template/…). */
export function tarball(t: Template): Buffer {
  const blocks: Buffer[] = [];
  for (const [path, file] of t.files) {
    const name = `package/template/${path === ".gitignore" ? "_gitignore" : path}`;
    const header = Buffer.alloc(512);
    header.write(name, 0, 100);
    header.write("0000644\0", 100);
    header.write("0000000\0", 108);
    header.write("0000000\0", 116);
    header.write(`${file.bytes.length.toString(8).padStart(11, "0")}\0`, 124);
    header.write("00000000000\0", 136);
    header.fill(" ", 148, 156);
    header.write("0", 156);
    header.write("ustar\0", 257);
    header.write("00", 263);
    let sum = 0;
    for (const byte of header) sum += byte;
    header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148);
    blocks.push(header, file.bytes, Buffer.alloc((512 - (file.bytes.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

export function fakeRegistry(templates: Template[], latest = templates.at(-1)!.version) {
  const archives = new Map(templates.map((t) => [t.version, tarball(t)]));
  const requests: string[] = [];
  const fetch: typeof globalThis.fetch = async (input) => {
    const url = input instanceof Request ? input.url : input.toString();
    requests.push(url);
    if (url === `${REGISTRY}create-feedbax`)
      return Response.json({
        "dist-tags": { latest },
        versions: Object.fromEntries(
          [...archives].map(([version, bytes]) => [
            version,
            {
              dist: {
                tarball: `${REGISTRY}create-feedbax/-/create-feedbax-${version}.tgz`,
                integrity: `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
              },
            },
          ]),
        ),
      });
    const version = /create-feedbax-(.+)\.tgz$/.exec(url)?.[1];
    const bytes = version ? archives.get(version) : undefined;
    return bytes ? new Response(new Uint8Array(bytes)) : new Response(null, { status: 404 });
  };
  return { fetch, requests };
}

/** Records every command; answers `secret list` and captures `secret bulk` payloads. */
export function fakeWrangler(remoteSecrets: string[] = []) {
  const calls: string[] = [];
  const bulk: Record<string, string>[] = [];
  const run: Run = async (cmd, args) => {
    const action = args.slice(args.indexOf("wrangler") + 1);
    calls.push(
      args.includes("wrangler") ? `wrangler ${action.join(" ")}` : `${cmd} ${args.join(" ")}`,
    );
    if (action[0] === "secret" && action[1] === "list")
      return {
        code: 0,
        stdout: JSON.stringify(remoteSecrets.map((name) => ({ name, type: "secret_text" }))),
        stderr: "",
      };
    if (action[0] === "secret" && action[1] === "bulk")
      bulk.push(JSON.parse(await readFile(action[2]!, "utf8")) as Record<string, string>);
    return { code: 0, stdout: "", stderr: "" };
  };
  return { run, calls, bulk };
}

const dirs: string[] = [];
export async function cleanup(): Promise<void> {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
}

/** A generated project: files on disk, optionally committed to a fresh Git repository. */
export async function project(
  files: Record<string, string> = {},
  options: { git?: boolean; devVars?: Record<string, string> | false } = {},
): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "feedbax-cli-"));
  dirs.push(cwd);
  const all: Record<string, string> = {
    "package.json": scaffoldedPackage("0.3.0"),
    "feedbax.config.ts": configSource(),
    "wrangler.jsonc": wranglerJson(),
    ".gitignore": "node_modules\n.dev.vars\n",
    ...files,
  };
  for (const [path, text] of Object.entries(all)) {
    await mkdir(dirname(join(cwd, path)), { recursive: true });
    await writeFile(join(cwd, path), text);
  }
  await mkdir(join(cwd, "src/contracts"), { recursive: true });
  await copyFile(CONFIG_CONTRACT, join(cwd, "src/contracts/config.ts"));
  if (options.devVars !== false) {
    const vars = {
      PORTAL_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: AUTH_SECRET,
      FEEDBAX_HOST_SECRET: HOST_SECRET,
      NOTION_TOKEN: "sentinel-notion-token",
      ...options.devVars,
    };
    await writeFile(
      join(cwd, ".dev.vars"),
      Object.entries(vars)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join("\n") + "\n",
    );
  }
  if (options.git) commitAll(cwd);
  return cwd;
}

export function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "user.name=test", "-c", "user.email=test@example.invalid", ...args],
    {
      cwd,
      encoding: "utf8",
    },
  );
}

export function commitAll(cwd: string): void {
  git(cwd, "init", "-q");
  git(cwd, "add", "-A");
  git(cwd, "commit", "-qm", "generated");
}
