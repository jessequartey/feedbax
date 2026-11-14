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

const authOnly = process.argv.includes("--auth");
const verifyEntryGuards = process.argv.includes("--verify-entry-guards");
assert(!verifyEntryGuards || authOnly, "entry guard checks require --auth");
const directAuth = process.argv.includes("--direct-auth");
const entryPairs = process.argv.includes("--auth-entry-pairs");
assert(
  !entryPairs || (authOnly && !directAuth),
  "paired comparison requires --auth without --direct-auth",
);
let activeEntry: "start" | "direct" = directAuth ? "direct" : "start";
assert(!directAuth || authOnly, "local direct-auth comparison requires --auth");
const requestCount = authOnly ? 50 : 150;
const root = resolve(
  process.argv.find((value) => value.startsWith("--built-dir="))?.slice("--built-dir=".length) ??
    "dist/server",
);
const reverseEntryPairs = process.argv.includes("--reverse-entry-pairs");
const files = (await readdir(root, { recursive: true })).filter((p) => p.endsWith(".js"));
const modules = await Promise.all(
  files.map(async (path) => ({
    type: "ESModule" as const,
    path: resolve(root, path),
    contents: await readFile(resolve(root, path), "utf8"),
  })),
);
const originalBuiltModulesSha256 = createHash("sha256")
  .update(modules.map((m) => m.contents).join("\n"))
  .digest("hex");
if (directAuth || entryPairs) {
  const entry = modules.find((m) => m.path === resolve(root, "index.js"))!;
  const http = modules.find((m) => /export \{[^}]*handleAuth as \w+/.test(m.contents));
  assert(http, "existing handleAuth export");
  const alias = /handleAuth as (\w+)/.exec(http.contents)![1];
  const dispatch = /return await [\w$]+\.fetch\(request\);/g;
  assert.equal([...entry.contents.matchAll(dispatch)].length, 1, "one guarded framework dispatch");
  // Change only in-memory modules. Keep line offsets for the emitted source maps.
  // The exact entry body/origin/error controls surrounding this dispatch are untouched.
  entry.contents = entry.contents
    .replace(
      /^(import[^\n]+;)/,
      `$1 import {${alias} as localDirectAuth} from "./assets/${basename(http.path)}";`,
    )
    .replace(
      dispatch,
      (match) =>
        `if (new URL(request.url).pathname.startsWith("/api/auth/")${entryPairs ? ' && request.headers.get("x-local-auth-entry") === "direct"' : ""}) return await localDirectAuth(request); ${match}`,
    );
}
let providerCalls = 0;
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
      ...(authOnly
        ? { GITHUB_CLIENT_ID: "fixture-client", GITHUB_CLIENT_SECRET: "fixture-secret" }
        : {}),
      FEEDBAX_HOST_SECRET: "YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE",
    },
    d1Databases: ["DB"],
    r2Buckets: ["IMAGES"],
    queueProducers: { SYNC_QUEUE: "sync" },
    outboundService: (request: Request) => {
      if (!authOnly) throw new Error("unexpected provider I/O");
      providerCalls++;
      const url = new URL(request.url);
      if (url.origin === "https://github.com" && url.pathname === "/login/oauth/access_token")
        return Response.json({
          access_token: "fixture-only-access",
          token_type: "bearer",
          scope: "read:user,user:email",
        });
      if (url.origin === "https://api.github.com" && url.pathname === "/user")
        return Response.json({
          id: 123,
          name: "OAuth profile",
          login: "fixture",
          email: "oauth-profile@example.invalid",
        });
      if (url.origin === "https://api.github.com" && url.pathname === "/user/emails")
        return Response.json([
          { email: "oauth-profile@example.invalid", primary: true, verified: true },
        ]);
      throw new Error("unexpected provider transport");
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
  const fnFiles = files.filter((path) => path.startsWith("assets/functions-"));
  const fnText = (
    await Promise.all(fnFiles.map((path) => readFile(resolve(root, path), "utf8")))
  ).join("\n");
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
  const cookieOf = (response: { headers: { getSetCookie(): string[] } }) =>
    response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
  const startSocial = async (n: number) => {
    const response = await runtime.dispatchFetch(
      "https://portal.example.com/api/auth/sign-in/social",
      {
        method: "POST",
        headers: {
          origin: "https://portal.example.com",
          "content-type": "application/json",
          "cf-connecting-ip": `192.0.${Math.floor(n / 250)}.${(n % 250) + 1}`,
          ...(entryPairs ? { "x-local-auth-entry": activeEntry } : {}),
        },
        body: JSON.stringify({ provider: "github", callbackURL: "/" }),
        redirect: "manual",
      },
    );
    assert.equal(response.status, 200, "controlled social start");
    const authorization = new URL(((await response.json()) as { url: string }).url);
    return {
      path: `/api/auth/callback/github?${new URLSearchParams({ state: authorization.searchParams.get("state")!, code: `fixture-only-code-${n}` })}`,
      cookie: cookieOf(response),
    };
  };
  const guardChecks: string[] = [];
  if (verifyEntryGuards) {
    for (const mode of entryPairs ? (["start", "direct"] as const) : [activeEntry]) {
      activeEntry = mode;
      const fetchGuard = (
        path: string,
        init: { method?: string; headers?: Record<string, string>; body?: string } = {},
      ) => {
        const headers = { ...init.headers, ...(entryPairs ? { "x-local-auth-entry": mode } : {}) };
        return runtime.dispatchFetch(`https://portal.example.com${path}`, {
          ...init,
          headers,
          redirect: "manual",
        });
      };
      const counts = () =>
        db
          .prepare(
            "SELECT (SELECT count(*) FROM user) AS users,(SELECT count(*) FROM account) AS accounts,(SELECT count(*) FROM session) AS sessions",
          )
          .first();
      const before = await counts();
      for (const path of [
        "sign-up/email",
        "get-access-token",
        "update-user",
        "get-session",
        "sign-in/social/",
        "sign-in/%73ocial",
      ])
        for (const method of ["GET", "POST", "HEAD", "PUT"]) {
          const response = await fetchGuard(`/api/auth/${path}`, {
            method,
            headers: { origin: "https://portal.example.com", "content-type": "application/json" },
            ...(method === "POST" || method === "PUT" ? { body: "{}" } : {}),
          });
          assert([404, 405].includes(response.status), `${mode} closed auth path`);
          assert.equal(response.headers.get("cache-control"), "no-store");
          assert(!response.headers.has("set-cookie"));
          await response.arrayBuffer();
        }
      const originCases: Record<string, string>[] = [
        { origin: "https://evil.example" },
        {},
        { origin: "https://portal.example.com", "sec-fetch-site": "same-site" },
      ];
      for (const headers of originCases) {
        const response = await fetchGuard("/api/auth/sign-in/social", {
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({ provider: "github", callbackURL: "/" }),
        });
        assert.equal(response.status, 403, `${mode} auth origin`);
        await response.arrayBuffer();
      }
      const bounded = await fetchGuard("/api/auth/sign-in/social", {
        method: "POST",
        headers: { origin: "https://portal.example.com", "content-type": "application/json" },
        body: "x".repeat(262145),
      });
      assert.equal(bounded.status, 413, `${mode} entry body bound`);
      await bounded.arrayBuffer();
      assert.deepEqual(
        await counts(),
        before,
        `${mode} rejected auth must not write identity/session`,
      );
      const started = await startSocial(mode === "start" ? 40000 : 41000);
      const providersBefore = providerCalls;
      const wrong = new URL(`https://portal.example.com${started.path}`);
      wrong.searchParams.set("state", "fixture-mismatch");
      const mismatch = await fetchGuard(wrong.pathname + wrong.search, {
        headers: { cookie: started.cookie, "sec-fetch-site": "cross-site" },
      });
      assert.equal(mismatch.status, 302);
      assert(mismatch.headers.get("location")?.includes("error="));
      assert.equal(providerCalls, providersBefore);
      await mismatch.arrayBuffer();
      const callback = await fetchGuard(started.path, {
        headers: { cookie: started.cookie, "sec-fetch-site": "cross-site" },
      });
      assert.equal(callback.status, 302);
      assert.equal(callback.headers.get("cache-control"), "no-store");
      const signedCookie = cookieOf(callback);
      assert(signedCookie.includes("session_token="), `${mode} actual callback session`);
      assert(
        callback.headers
          .getSetCookie()
          .some(
            (value) =>
              value.includes("HttpOnly") &&
              value.includes("SameSite=Lax") &&
              value.includes("Secure"),
          ),
        `${mode} cookie policy`,
      );
      assert.equal(providerCalls, providersBefore + 3);
      await callback.arrayBuffer();
      const replay = await fetchGuard(started.path, {
        headers: { cookie: started.cookie, "sec-fetch-site": "cross-site" },
      });
      assert.equal(replay.status, 302);
      assert(replay.headers.get("location")?.includes("error="));
      assert.equal(providerCalls, providersBefore + 3);
      await replay.arrayBuffer();
      const viewer = async () => {
        const response = await fetchGuard(await rpcPath("getViewer"), {
          headers: {
            origin: "https://portal.example.com",
            "sec-fetch-site": "same-origin",
            "x-tsr-serverFn": "true",
            cookie: signedCookie,
          },
        });
        assert.equal(response.status, 200);
        assert(response.headers.get("cache-control")?.includes("no-store"));
        return (
          fromCrossJSON(JSON.parse(await response.text()), {}) as {
            result: { user: { kind: string } | null };
          }
        ).result.user;
      };
      assert.equal((await viewer())?.kind, "account");
      const signout = await fetchGuard("/api/auth/sign-out", {
        method: "POST",
        headers: {
          origin: "https://portal.example.com",
          "content-type": "application/json",
          cookie: signedCookie,
        },
        body: "{}",
      });
      assert.equal(signout.status, 200);
      await signout.arrayBuffer();
      assert.equal(await viewer(), null);
      guardChecks.push(
        `${mode}: closed endpoints/no writes; Origin/CSRF; byte bound; actual callback cookie/state mismatch/replay; sign-out revocation`,
      );
    }
  }
  const callbackInputs: { path: string; cookie: string }[] = [];
  const signoutCookies: string[] = [];
  if (authOnly && !verifyEntryGuards) {
    for (let i = 0; i < (requestCount + 12) * (entryPairs ? 4 : 1); i++) {
      // Setup is outside sampled windows: callback and sign-out are measured individually.
      const start = await startSocial(i + 500);
      const response = await runtime.dispatchFetch(`https://portal.example.com${start.path}`, {
        headers: { cookie: start.cookie, "cf-connecting-ip": `192.0.20.${i + 1}` },
        redirect: "manual",
      });
      assert.equal(response.status, 302, "controlled callback session");
      signoutCookies.push(cookieOf(response));
      callbackInputs.push(await startSocial(i + 1000));
    }
  }
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
  if (authOnly)
    operations.splice(
      0,
      operations.length,
      ["social-start", "/api/auth/sign-in/social", false],
      ["social-callback-returning", "/api/auth/callback/github", false],
      ["sign-out", "/api/auth/sign-out", false],
      ["getViewer-signed-in", await rpcPath("getViewer"), true],
    );
  if (entryPairs)
    operations.splice(
      0,
      operations.length,
      ...operations.flatMap(([name, path, signed]) =>
        (reverseEntryPairs
          ? ["direct", "start", "start", "direct"]
          : ["start", "direct", "direct", "start"]
        ).map((mode, batch): [string, string, boolean] => [
          `${name}:${mode}:${batch}`,
          path,
          signed,
        ]),
      ),
    );
  if (verifyEntryGuards) operations.splice(0, operations.length);
  for (const [label, path, signedIn] of operations) {
    const [operation, mode, batchValue] = label.split(":");
    const batch = Number(batchValue ?? 0);
    if (entryPairs) activeEntry = mode as "start" | "direct";
    let iteration = 0;
    const run = async () => {
      const current = iteration++;
      if (operation === "social-start") {
        await startSocial(current + 1500 + batch * 100);
        return;
      }
      const callback =
        operation === "social-callback-returning"
          ? callbackInputs[batch * (requestCount + 12) + current]
          : undefined;
      const response = await runtime.dispatchFetch(
        `https://portal.example.com${callback?.path ?? path}`,
        {
          ...(operation === "sign-out" ? { method: "POST", body: "{}" } : {}),
          redirect: "manual",
          headers: {
            ...(callback
              ? { cookie: callback.cookie }
              : operation === "sign-out"
                ? {
                    cookie: signoutCookies[batch * (requestCount + 12) + current],
                    "content-type": "application/json",
                  }
                : signedIn
                  ? { cookie: sessionCookie }
                  : {}),
            ...(authOnly
              ? { "cf-connecting-ip": `192.0.${operation === "sign-out" ? 22 : 21}.${current + 1}` }
              : {}),
            ...(entryPairs ? { "x-local-auth-entry": activeEntry } : {}),
            "x-tsr-serverFn": "true",
            origin: "https://portal.example.com",
            "sec-fetch-site": "same-origin",
          },
        },
      );
      assert.equal(response.status, callback ? 302 : 200, operation);
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
    for (let i = 0; i < requestCount; i++) await run();
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
      operation: label,
      requests: requestCount,
      elapsedMs,
      sampledNonIdleMs,
      sampledNonIdleMsPerRequest: sampledNonIdleMs / requestCount,
      groupsMs,
      extractTablesRelationalConfigSelfMs: self.extractTablesRelationalConfig ?? 0,
      topSelf: Object.entries(self)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([name, ms]) => ({ name, ms })),
    });
    console.log(label, (sampledNonIdleMs / requestCount).toFixed(3), "sampled ms/request");
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
        authOnly,
        directAuth,
        entryPairs,
        reverseEntryPairs,
        guardChecks,
        originalBuiltModulesSha256,
        method:
          "V8 Inspector 100us; 12 warmup; 150 read requests or 50 auth requests per operation, sequential successful requests; auth setup outside sampled windows; fixture provider HTTP; IPs vary per social start to retain enabled database rate limits; one local D1 binding, 5 Planned fixture posts; no cookies unless operation labeled signed-in; source-map disjoint stacks; not CF billed CPU",
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
