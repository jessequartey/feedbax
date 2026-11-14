// Run after build. The real emitted Start parser/router and Worker fetch entry execute
// against local D1/R2. No server, network provider calls or deployed resources are used.
import assert from "node:assert/strict";
import { readFile, readdir, writeFile, rm } from "node:fs/promises";
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { env, waitUntil, resetEnv, disposeEnv } from "../tests/fixtures/cloudflare-workers.ts";

Object.assign(globalThis, { __feedbaxEntryEnv: env, __feedbaxWaitUntil: waitUntil });
const stub = `export const env = globalThis.__feedbaxEntryEnv;
export const waitUntil = globalThis.__feedbaxWaitUntil;
export const exports = {};
export class WorkerEntrypoint {} export class DurableObject {} export class WorkflowEntrypoint {} export class RpcTarget {} export default {};`;
const hooks = `export async function resolve(specifier, context, next) {
  if (specifier.startsWith('cloudflare:')) return {url:'data:text/javascript,'+encodeURIComponent(${JSON.stringify(stub)}),shortCircuit:true};
  return next(specifier,context);
}`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`, import.meta.url);
const entry = resolve("dist/server/index.js");
const temporary = resolve(`dist/server/.entry-test-${crypto.randomUUID()}.js`);
type Handler = { fetch(request: Request): Promise<Response> };
try {
  await resetEnv();
  const { form, mintToken } = await import("../tests/api/helpers.ts");
  const built = await readFile(entry, "utf8");
  const frameworkName = /return await ([\w$]+)\.fetch\(request\)/.exec(built)?.[1];
  assert(frameworkName, "find the emitted framework handler");
  // Expose the unmodified framework handler to verify its default policy independently
  // of Feedbax's early worker guard. This temporary module is removed below.
  await writeFile(temporary, `${built}\nexport { ${frameworkName} as framework };\n`);
  const { default: emittedWorker, framework } = (await import(pathToFileURL(temporary).href)) as {
    default: Handler;
    framework: Handler;
  };
  const worker = process.env.FEEDBAX_ENTRY_BASELINE === "1" ? framework : emittedWorker;
  const assets = resolve("dist/server/assets");
  const functions = (await readdir(assets)).find((name) => /^functions-.*\.js$/.test(name));
  assert(functions);
  const rpc = /var createPost_createServerFn_handler = createServerRpc\(\{\s*id: "([^"]+)"/.exec(
    await readFile(resolve(assets, functions), "utf8"),
  )?.[1];
  assert(rpc);
  const url = `${env.PORTAL_URL}/_serverFn/${rpc}`;
  const signup = await worker.fetch(
    new Request(`${env.PORTAL_URL}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { origin: env.PORTAL_URL, "content-type": "application/json" },
      body: JSON.stringify({
        name: "Entry user",
        email: "entry@example.com",
        password: "a long test password",
      }),
    }),
  );
  assert.equal(signup.status, 200);
  const cookie = signup.headers.get("set-cookie")!.split(";")[0];
  for (const handle of [framework, worker]) {
    for (const origin of ["http://sibling.localhost:4000", "https://evil.example"]) {
      const response = await handle.fetch(
        new Request(url, {
          method: "POST",
          headers: {
            origin,
            cookie,
            "sec-fetch-site": origin.includes("sibling") ? "same-site" : "cross-site",
          },
          body: form(),
        }),
      );
      assert.equal(response.status, 403, "sibling/cross-origin cookie RPC rejected");
      await response.arrayBuffer();
    }
  }
  assert.deepEqual(await env.DB.prepare("SELECT count(*) AS n FROM posts").first(), { n: 0 });
  assert.equal(
    (await worker.fetch(new Request(url, { method: "POST", headers: { cookie }, body: form() })))
      .status,
    403,
  );
  const data = form();
  const legitimate = await worker.fetch(
    new Request(url, {
      method: "POST",
      headers: { origin: env.PORTAL_URL, cookie, "sec-fetch-site": "same-origin" },
      body: data,
    }),
  );
  assert.equal(legitimate.status, 200);
  assert.deepEqual(await env.DB.prepare("SELECT id FROM posts").first(), { id: data.get("id") });
  await legitimate.arrayBuffer();
  for (const type of ["multipart/form-data; boundary=x", "application/json"]) {
    for (const length of [undefined, "1"]) {
      let remaining = type.startsWith("multipart") ? 16 * 1024 * 1024 : 300000;
      const request = new Request(url, {
        method: "POST",
        headers: {
          origin: env.PORTAL_URL,
          "content-type": type,
          ...(length ? { "content-length": length } : {}),
        },
        body: new ReadableStream({
          pull(controller) {
            if (remaining <= 0) return controller.close();
            const size = Math.min(remaining, 65536);
            remaining -= size;
            controller.enqueue(new Uint8Array(size));
          },
        }),
        duplex: "half",
      } as RequestInit);
      const response = await worker.fetch(request);
      assert.equal(response.status, 413, "byte guard precedes real framework parsing");
      await response.arrayBuffer();
    }
  }
  const bearer = await worker.fetch(
    new Request(`${env.PORTAL_URL}/api/posts`, {
      method: "POST",
      headers: { origin: "http://localhost:5173", authorization: `Bearer ${await mintToken()}` },
      body: form(),
    }),
  );
  assert.equal(bearer.status, 201, "cross-origin bearer endpoint remains usable");
  assert.equal(bearer.headers.get("access-control-allow-origin"), "http://localhost:5173");
  await bearer.arrayBuffer();
  console.log(
    "ok: real built Start handler rejects sibling-origin cookie mutations by default; worker also rejects missing Origin, bounds chunked/forged-length multipart and JSON before parsing, accepts portal mutation and cross-origin bearer",
  );
} finally {
  await rm(temporary, { force: true });
  await disposeEnv();
}
