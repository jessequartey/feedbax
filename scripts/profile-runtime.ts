// Local V8 sampled CPU in actual workerd; never Cloudflare-billed CPU. Run after build.
// Writes only sanitized aggregates. No production credentials or outbound provider I/O.
import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createHash, createHmac } from "node:crypto";
import { resolve, basename } from "node:path";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { SourceMapConsumer } from "source-map";
import { toJSONAsync, fromCrossJSON } from "seroval";
// @ts-expect-error ws is the Inspector transport supplied by Miniflare.
import WebSocket from "ws";

const root = resolve("dist/server");
const files = (await readdir(root, { recursive: true })).filter((p) => p.endsWith(".js"));
const modules = await Promise.all(
  files.map(async (path) => ({
    type: "ESModule" as const,
    path: resolve(root, path),
    contents: await readFile(resolve(root, path), "utf8"),
  })),
);
const runtime = new Miniflare(
  convertV4MiniflareOptions({
    modules,
    modulesRoot: root,
    compatibilityDate: "2026-11-13",
    compatibilityFlags: ["nodejs_compat"],
    inspectorPort: 0,
    bindings: {
      PORTAL_URL: "https://portal.example.com",
      BETTER_AUTH_SECRET: "local-profile-secret-at-least-32-characters",
      FEEDBAX_HOST_SECRET: "YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE",
    },
    d1Databases: ["DB"],
    r2Buckets: ["IMAGES"],
    queueProducers: { SYNC_QUEUE: "sync" },
    outboundService: () => {
      throw new Error("unexpected provider I/O");
    },
  }),
);
let socket: globalThis.WebSocket | undefined;
const maps = new Map<string, SourceMapConsumer>();
try {
  const db = await runtime.getD1Database("DB");
  for (const file of (await readdir("migrations")).filter((p) => p.endsWith(".sql")).sort())
    for (const statement of (await readFile(resolve("migrations", file), "utf8")).split(
      "--> statement-breakpoint",
    ))
      if (statement.trim()) await db.prepare(statement).run();
  await db
    .prepare(
      "INSERT INTO user (id,name,email) VALUES ('profile','Profile','profile@example.invalid')",
    )
    .run();
  const ids = Array.from({ length: 5 }, (_, i) => `11111111-1111-4111-8111-11111111111${i}`);
  for (const id of ids)
    await db
      .prepare(
        "INSERT INTO posts (id,author_id,title,body,category,status,created_at,updated_at) VALUES (?,'profile','Runtime fixture','Public body','feature','planned',1,1)",
      )
      .bind(id)
      .run();
  const fnFile = files.find((p) => p.startsWith("assets/functions-"))!;
  const fnText = await readFile(resolve(root, fnFile), "utf8");
  const rpcIds = Object.fromEntries(
    ["getViewer", "listPosts", "getPost", "listComments", "getRoadmap", "listMyPosts"].map(
      (name) => {
        const id = new RegExp(
          `var ${name}_createServerFn_handler = createServerRpc\\(\\{\\s*id: "([^"]+)"`,
        ).exec(fnText)?.[1];
        assert(id, `real emitted ${name} ID`);
        return [name, id];
      },
    ),
  );
  const rpcPath = async (name: string, data?: unknown) => {
    const url = new URL(`/_serverFn/${rpcIds[name]}`, "https://portal.example.com");
    if (data !== undefined)
      url.searchParams.set("payload", JSON.stringify(await toJSONAsync({ data })));
    return url.pathname + url.search;
  };
  const inspector = await runtime.getInspectorURL();
  const endpoint = new URL(inspector);
  endpoint.protocol = "http:";
  endpoint.pathname = "/json/list";
  const targets = (await (await fetch(endpoint)).json()) as { webSocketDebuggerUrl: string }[];
  socket = new WebSocket(targets[0].webSocketDebuggerUrl, { origin: "http://localhost" });
  await new Promise<void>((ok, fail) => {
    socket!.onopen = () => ok();
    socket!.onerror = () => fail(new Error("Inspector failed"));
  });
  let sequence = 0;
  const pending = new Map<
    number,
    { resolve: (value: any) => void; reject: (error: Error) => void }
  >();
  socket!.onmessage = (event: MessageEvent) => {
    const msg = JSON.parse(String(event.data));
    if (msg.id) {
      const entry = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) entry?.reject(new Error(msg.error.message));
      else entry?.resolve(msg.result);
    }
  };
  const send = (method: string, params: Record<string, unknown> = {}) =>
    new Promise<any>((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      socket!.send(JSON.stringify({ id, method, params }));
    });
  for (const file of files) {
    try {
      maps.set(
        basename(file),
        await new SourceMapConsumer(
          JSON.parse(await readFile(resolve(root, file + ".map"), "utf8")),
        ),
      );
    } catch {
      /* no source map */
    }
  }
  const header = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      sub: "profile-signed",
      name: "Signed profile",
      jti: crypto.randomUUID(),
      exp: Math.floor(Date.now() / 1000) + 300,
    }),
  ).toString("base64url");
  const signature = createHmac("sha256", Buffer.alloc(32, 97))
    .update(`${header}.${payload}`)
    .digest("base64url");
  const login = await runtime.dispatchFetch(
    `https://portal.example.com/api/auth/feedbax/sign-in?token=${header}.${payload}.${signature}`,
    {
      method: "POST",
      headers: {
        origin: "https://portal.example.com",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "",
      redirect: "manual",
    },
  );
  assert.equal(login.status, 302, "local host confirmation creates profiling session");
  const sessionCookie = login.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  await send("Profiler.enable");
  await send("Profiler.setSamplingInterval", { interval: 100 });
  const output = [];
  const operations: [string, string, boolean][] = [];
  for (const signedIn of [false, true]) {
    const suffix = signedIn ? "-signed-in" : "";
    for (const [name, path] of [
      ["board", "/"],
      ["post", `/posts/${ids[0]}`],
      ["roadmap", "/roadmap"],
      ["my-feedback", "/my-feedback"],
    ])
      operations.push([name + "-document" + suffix, path, signedIn]);
    for (const [name, data] of [
      ["getViewer", undefined],
      ["listPosts", {}],
      ["getPost", { id: ids[0] }],
      ["listComments", { postId: ids[0] }],
      ["getRoadmap", {}],
      ["listMyPosts", {}],
    ] as const)
      operations.push([name + suffix, await rpcPath(name, data), signedIn]);
  }
  for (const [operation, path, signedIn] of operations) {
    const run = async () => {
      const response = await runtime.dispatchFetch(`https://portal.example.com${path}`, {
        headers: {
          ...(signedIn ? { cookie: sessionCookie } : {}),
          "x-tsr-serverFn": "true",
          origin: "https://portal.example.com",
          "sec-fetch-site": "same-origin",
        },
      });
      assert.equal(response.status, 200, operation);
      const body = await response.text();
      if (path.startsWith("/_serverFn/")) {
        assert.match(response.headers.get("cache-control") ?? "", /private.*no-store/);
        const decoded = fromCrossJSON(JSON.parse(body), {}) as {
          result?: unknown;
          error?: unknown;
        };
        assert(!decoded.error, `${operation} RPC succeeds`);
        assert(decoded.result !== undefined, `${operation} returns data`);
      }
    };
    for (let i = 0; i < 12; i++) await run();
    await send("Profiler.start");
    const start = performance.now();
    for (let i = 0; i < 150; i++) await run();
    const elapsedMs = performance.now() - start;
    const { profile } = await send("Profiler.stop");
    const nodes = new Map<number, any>(profile.nodes.map((n: any) => [n.id, n]));
    const parent = new Map<number, number>();
    for (const n of profile.nodes) for (const child of n.children ?? []) parent.set(child, n.id);
    const group = (n: any): string => {
      const frame = n.callFrame;
      const source =
        maps
          .get(basename(frame.url))
          ?.originalPositionFor({ line: frame.lineNumber + 1, column: frame.columnNumber })
          .source ?? frame.url;
      if (/react-dom/.test(source)) return "react";
      if (/better-auth|server\/auth\.ts/.test(source)) return "auth";
      if (/drizzle-orm/.test(source)) return "drizzle";
      if (/tanstack|seroval/.test(source)) return "framework";
      return "other";
    };
    const groupsMs: Record<string, number> = {
      react: 0,
      auth: 0,
      drizzle: 0,
      framework: 0,
      other: 0,
      idle: 0,
    };
    const self: Record<string, number> = {};
    for (let i = 0; i < profile.samples.length; i++) {
      const n = nodes.get(profile.samples[i]);
      const ms = profile.timeDeltas[i] / 1000;
      self[n.callFrame.functionName] = (self[n.callFrame.functionName] ?? 0) + ms;
      let bucket = n.callFrame.functionName === "(idle)" ? "idle" : "other";
      if (bucket !== "idle")
        for (let cursor = n; cursor; cursor = nodes.get(parent.get(cursor.id)!)) {
          const found = group(cursor);
          if (found !== "other") {
            bucket = found;
            break;
          }
        }
      groupsMs[bucket] += ms;
    }
    const sampledNonIdleMs = Object.entries(groupsMs)
      .filter(([k]) => k !== "idle")
      .reduce((sum, [, v]) => sum + v, 0);
    output.push({
      operation,
      requests: 150,
      elapsedMs,
      sampledNonIdleMs,
      sampledNonIdleMsPerRequest: sampledNonIdleMs / 150,
      groupsMs,
      extractTablesRelationalConfigSelfMs: self.extractTablesRelationalConfig ?? 0,
      topSelf: Object.entries(self)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([name, ms]) => ({ name, ms })),
    });
    console.log(operation, (sampledNonIdleMs / 150).toFixed(3), "sampled ms/request");
  }
  const destination = process.argv[2];
  assert(destination, "pass sanitized output JSON path");
  await writeFile(
    destination,
    JSON.stringify(
      {
        nodeVersion: process.version,
        builtModulesSha256: createHash("sha256")
          .update(modules.map((m) => m.contents).join("\n"))
          .digest("hex"),
        method:
          "V8 Inspector 100us; 12 warmup, 150 sequential successful requests each; one local D1 binding, 5 Planned fixture posts; no cookies unless operation labeled signed-in; source-map disjoint stacks; not CF billed CPU",
        results: output,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  socket?.close();
  for (const map of maps.values()) map.destroy();
  await runtime.dispose();
}
