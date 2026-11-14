// Local-only built-worker integration. No deploy, public probes or production credentials.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { createHmac } from "node:crypto";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

const root = resolve("dist/server");
const files = (await readdir(root, { recursive: true })).filter((p) => p.endsWith(".js"));
const modules = await Promise.all(
  files.map(async (path) => ({
    type: "ESModule" as const,
    path: resolve(root, path),
    contents: await readFile(resolve(root, path), "utf8"),
  })),
);
function exported(name: string) {
  for (const module of modules) {
    const exports = [...module.contents.matchAll(/export \{([^}]+)\}/g)]
      .map((match) => match[1])
      .join(",");
    const alias = new RegExp(`(?:^|,)\\s*${name} as (\\w+)`).exec(exports)?.[1];
    if (alias)
      return `import { ${alias} as ${name} } from ${JSON.stringify("./" + relative(root, module.path))};`;
  }
  throw new Error(`Missing built export ${name}`);
}
const probe = resolve(root, "auth-isolation-test.js");
const probeCode = `
import { env } from "cloudflare:workers";
${["createDb", "createAuth", "viewerUser"].map(exported).join("\n")}
export default { async fetch(request) {
  // Synchronous setup must not touch a binding's I/O methods.
  const inert = { prepare() { throw new Error("construction performed I/O"); } };
  if(createDb(inert)!==createDb(inert)) throw new Error("wrapper not reused");
  if(createDb(env.DB)===createDb(env.DB_OTHER)) throw new Error("binding crossed");
  const settings={name:"Test",appUrl:"https://host.example.com",auth:{anonymous:false},integrations:{notion:{dataSourceId:"00000000-0000-0000-0000-000000000000"},github:false}};
  const bindings={...env,DB:env.DB_OTHER};
  const phase=new URL(request.url).pathname;
  if(phase==="/host") return createAuth(settings,bindings).handler(new Request("https://portal.example.com/api/auth/feedbax/sign-in"+new URL(request.url).search,{method:"POST",headers:{origin:env.PORTAL_URL}}));
  if(phase==="/viewer") return Response.json(await viewerUser(request.headers,settings,bindings));
  const db=createDb(env.DB);
  const find=id=>db.query.user.findFirst({where:(fields,{eq})=>eq(fields.id,id)});
  const rows=await Promise.all([find("one"),find("two")]);
  const other=await createDb(env.DB_OTHER).query.user.findMany();
  return Response.json({same:createDb(env.DB)===db,rows:rows.map(row=>row?.name??null),other:other.map(row=>row.name)});
}};`;
let exchanges = 0;
const hostSecret = "YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE";
const common = {
  modulesRoot: root,
  compatibilityDate: "2026-11-13",
  compatibilityFlags: ["nodejs_compat"] as string[],
  bindings: {
    PORTAL_URL: "https://portal.example.com",
    BETTER_AUTH_SECRET: "test-only-runtime-secret-at-least-32-characters",
    FEEDBAX_HOST_SECRET: hostSecret,
    GITHUB_CLIENT_ID: "test-client",
    GITHUB_CLIENT_SECRET: "test-secret",
  },
  r2Buckets: ["IMAGES"],
  queueProducers: { SYNC_QUEUE: "sync" },
};
const runtime = new Miniflare(
  convertV4MiniflareOptions({
    workers: [
      {
        name: "app",
        ...common,
        modules,
        d1Databases: { DB: "primary", DB_OTHER: "secondary" },
        outboundService: async (request: Request) => {
          const url = new URL(request.url);
          if (url.origin === "https://github.com" && url.pathname === "/login/oauth/access_token") {
            exchanges++;
            return Response.json({
              access_token: "fixture-only-access",
              token_type: "bearer",
              scope: "read:user,user:email",
            });
          }
          if (url.origin === "https://api.github.com" && url.pathname === "/user")
            return Response.json({
              id: 123,
              name: "Social fixture",
              email: "social@example.invalid",
              login: "fixture",
            });
          if (url.origin === "https://api.github.com" && url.pathname === "/user/emails")
            return Response.json([
              { email: "social@example.invalid", primary: true, verified: true },
            ]);
          throw new Error("Unexpected outbound request");
        },
      },
      {
        name: "probe",
        ...common,
        modules: [{ type: "ESModule" as const, path: probe, contents: probeCode }, ...modules],
        d1Databases: { DB: "primary", DB_OTHER: "secondary" },
      },
    ],
  }),
);
const cookies = (response: { headers: { getSetCookie(): string[] } }) =>
  response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
const token = (sub: string) => {
  const h = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url");
  const p = Buffer.from(
    JSON.stringify({
      sub,
      name: sub,
      exp: Math.floor(Date.now() / 1000) + 300,
      jti: crypto.randomUUID(),
    }),
  ).toString("base64url");
  return `${h}.${p}.${createHmac("sha256", Buffer.from(hostSecret, "base64url")).update(`${h}.${p}`).digest("base64url")}`;
};
try {
  type Service = { fetch(input: string, init?: RequestInit): Promise<Response> };
  const service = async (name: string): Promise<Service> => {
    const worker = (await runtime.getWorker(name)) as unknown as Service;
    return { fetch: (input, init) => worker.fetch(input, { ...init, redirect: "manual" }) };
  };
  const app = {
    fetch: (input: string, init?: Parameters<typeof runtime.dispatchFetch>[1]) =>
      runtime.dispatchFetch(input, { ...init, redirect: "manual" }),
  };
  const local = await service("probe");
  const primary = await runtime.getD1Database("DB", "app"),
    secondary = await runtime.getD1Database("DB_OTHER", "probe");
  for (const db of [primary, secondary])
    for (const file of (await readdir("migrations")).filter((p) => p.endsWith(".sql")).sort())
      for (const sql of (await readFile(resolve("migrations", file), "utf8")).split(
        "--> statement-breakpoint",
      ))
        if (sql.trim()) await db.prepare(sql).run();
  await primary
    .prepare(
      "INSERT INTO user (id,name,email) VALUES ('one','One','one@example.invalid'),('two','Two','two@example.invalid')",
    )
    .run();
  const probeFetch = (path: string, cookie = "") =>
    local.fetch(`https://portal.example.com${path}`, { headers: { cookie } });
  assert.deepEqual(await (await probeFetch("/db")).json(), {
    same: true,
    rows: ["One", "Two"],
    other: [],
  });
  await primary.prepare("UPDATE user SET name='Fresh' WHERE id='one'").run();
  assert.deepEqual(await (await probeFetch("/db")).json(), {
    same: true,
    rows: ["Fresh", "Two"],
    other: [],
  });
  await primary.prepare("DELETE FROM user").run();
  assert.deepEqual(await (await probeFetch("/db")).json(), {
    same: true,
    rows: [null, null],
    other: [],
  });
  const a = await probeFetch(`/host?token=${token("Host one")}`),
    b = await probeFetch(`/host?token=${token("Host two")}`);
  assert.equal(a.status, 302);
  assert.equal(b.status, 302);
  const ca = cookies(a),
    cb = cookies(b);
  const viewers = await Promise.all([probeFetch("/viewer", ca), probeFetch("/viewer", cb)]);
  assert.deepEqual(await Promise.all(viewers.map((r) => r.json().then((u: any) => u.name))), [
    "Host one",
    "Host two",
  ]);
  assert.equal(
    (await primary.prepare("SELECT count(*) AS n FROM user").first())?.n,
    0,
    "host identity uses injected DB",
  );
  assert.equal(
    (await secondary.prepare("SELECT count(*) AS n FROM used_tokens").first())?.n,
    2,
    "host token consumption uses injected DB",
  );
  await secondary
    .prepare("DELETE FROM session WHERE user_id=(SELECT id FROM user WHERE name='Host one')")
    .run();
  assert.equal(
    await (await probeFetch("/viewer", ca)).json(),
    null,
    "logout/reset visible on next request",
  );
  assert.equal(
    ((await (await probeFetch("/viewer", cb)).json()) as { name: string }).name,
    "Host two",
  );
  const assets = modules.find((m) => /assets\/functions-/.test(m.path))!.contents;
  const viewerId =
    /var getViewer_createServerFn_handler = createServerRpc\(\{\s*id: "([^"]+)"/.exec(assets)?.[1];
  assert(viewerId);
  const rpc = () =>
    app.fetch(`https://portal.example.com/_serverFn/${viewerId}`, {
      headers: {
        origin: "https://portal.example.com",
        "sec-fetch-site": "same-origin",
        "x-tsr-serverFn": "true",
      },
    });
  const redirect = await app.fetch("https://portal.example.com/signup?to=%2Fmy-feedback");
  assert.equal(redirect.status, 307);
  assert.match(redirect.headers.get("location") ?? "", /\/login\?to=%2Fmy-feedback/);
  const out = await rpc();
  assert.equal(out.status, 200);
  assert.match(out.headers.get("cache-control") ?? "", /private.*no-store/);
  await out.arrayBuffer();
  const start = await app.fetch("https://portal.example.com/api/auth/sign-in/social", {
    method: "POST",
    headers: { origin: "https://portal.example.com", "content-type": "application/json" },
    body: JSON.stringify({ provider: "github", callbackURL: "/" }),
  });
  assert.equal(start.status, 200);
  const authUrl = new URL(((await start.json()) as { url: string }).url);
  const callback = `https://portal.example.com/api/auth/callback/github?${new URLSearchParams({ state: authUrl.searchParams.get("state")!, code: "fixture-code" })}`;
  const social = await app.fetch(callback, {
    headers: { cookie: cookies(start), "sec-fetch-site": "cross-site" },
  });
  assert.equal(social.status, 302);
  assert.equal(exchanges, 1);
  assert.match(cookies(social), /session_token=/);
  const signed = await app.fetch(`https://portal.example.com/_serverFn/${viewerId}`, {
    headers: {
      origin: "https://portal.example.com",
      "sec-fetch-site": "same-origin",
      "x-tsr-serverFn": "true",
      cookie: cookies(social),
    },
  });
  assert.equal(signed.status, 200);
  assert.match(await signed.text(), /Social fixture/);
  const replay = await app.fetch(callback, { headers: { cookie: cookies(start) } });
  assert.match(replay.headers.get("location") ?? "", /error=/);
  assert.equal(exchanges, 1);
  for (const path of [
    "sign-up/email",
    "update-user",
    "get-session",
    "get-access-token",
    "sign-in/social/",
    "sign-in/%73ocial",
  ]) {
    const response = await app.fetch(`https://portal.example.com/api/auth/${path}`, {
      method: "POST",
      headers: {
        origin: "https://portal.example.com",
        "content-type": "application/json",
        cookie: cookies(social),
      },
      body: "{}",
    });
    assert([404, 405].includes(response.status));
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  console.log(
    "ok: real workerd DB wrapper construction/binding/freshness/concurrent-params; injected host identities/token consumption; concurrent sessions/revocation; emitted private viewer RPC; controlled OAuth callback/state replay; mounted disabled routes",
  );
} finally {
  await runtime.dispose();
}
