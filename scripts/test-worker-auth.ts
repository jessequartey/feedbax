// Local-only built-worker integration. No deploy, public probes or production credentials.
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { createHmac } from "node:crypto";
import { toJSONAsync, fromCrossJSON } from "seroval";
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
// Test-only request meter. Never shipped or used for CPU profiling.
const meteredCode = `
import {env} from "cloudflare:workers";
import worker from "./index.js";
export default {async fetch(request){
  const original=env.DB;
  let reads=0;
  env.DB=new Proxy(original,{get(target,key){
    if(key==="prepare")return sql=>{if(/^\\s*select\\b/i.test(sql))reads++;return target.prepare(sql);};
    const value=Reflect.get(target,key);return typeof value==="function"?value.bind(target):value;
  }});
  try {
    const response=await worker.fetch(request);
    // Drain before restoring bindings, retaining per-request accounting for streamed RPCs.
    const body=await response.arrayBuffer();
    const headers=new Headers(response.headers);headers.set("X-Local-D1-Reads",String(reads));
    return new Response(body,{status:response.status,headers});
  } finally {env.DB=original;}
}};
`;
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
        modules: [
          {
            type: "ESModule" as const,
            path: resolve(root, "metered-app.js"),
            contents: meteredCode,
          },
          ...modules,
        ],
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
        // Deliberately no DB binding: any document loader/auth/data read must fail.
        name: "shell",
        ...common,
        modules,
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
  const shell = await service("shell");
  for (const path of [
    "/",
    "/roadmap",
    "/my-feedback",
    "/login",
    "/signup?to=%2Fmy-feedback",
    "/posts/11111111-1111-4111-8111-111111111111",
  ]) {
    for (const cookie of ["", "__Secure-better-auth.session_token=forged"]) {
      const response = await shell.fetch(`https://portal.example.com${path}`, {
        headers: { cookie },
      });
      const html = await response.text();
      assert.equal(response.status, 200, "deep-link shell does not need bindings or a viewer");
      assert.match(html, /Loading feedback/);
      assert.doesNotMatch(
        html,
        /Runtime fixture|Host one|Social fixture|session_token|test-client|loaderData/,
      );
      assert.equal(response.headers.has("set-cookie"), false);
    }
  }
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
  assert.equal(
    redirect.status,
    200,
    "signup document defers its compatibility redirect to client routing",
  );
  assert.match(await redirect.text(), /Loading feedback/);
  const rpcId = (name: string) => {
    const id = new RegExp(
      `var ${name}_createServerFn_handler = createServerRpc\\(\\{\\s*id: "([^"]+)"`,
    ).exec(assets)?.[1];
    assert(id, `find real emitted ${name}`);
    return id;
  };
  const call = async (name: string, data?: unknown, cookie = "", method = "GET") => {
    const url = new URL(`/_serverFn/${rpcId(name)}`, "https://portal.example.com");
    const payload = data === undefined ? undefined : JSON.stringify(await toJSONAsync({ data }));
    if (method === "GET" && payload) url.searchParams.set("payload", payload);
    const response = await app.fetch(url.href, {
      method,
      headers: {
        cookie,
        origin: "https://portal.example.com",
        "sec-fetch-site": "same-origin",
        "x-tsr-serverFn": "true",
        ...(method === "POST" ? { "content-type": "application/json" } : {}),
      },
      ...(method === "POST" ? { body: payload } : {}),
    });
    assert.equal(response.status, 200, `${name} RPC status`);
    assert.match(
      response.headers.get("cache-control") ?? "",
      /private.*no-store/,
      `${name} private response`,
    );
    const decoded = fromCrossJSON(JSON.parse(await response.text()), {}) as {
      result: any;
      error?: unknown;
    };
    assert(!decoded.error, `${name} RPC succeeds`);
    return decoded.result;
  };
  const signIn = async (sub: string) => {
    const response = await app.fetch(
      `https://portal.example.com/api/auth/feedbax/sign-in?token=${token(sub)}`,
      {
        method: "POST",
        headers: {
          origin: "https://portal.example.com",
          "content-type": "application/x-www-form-urlencoded",
        },
        body: "",
      },
    );
    assert.equal(response.status, 302);
    return cookies(response);
  };
  const clientOne = await signIn("Client one"),
    clientTwo = await signIn("Client two");
  const identityOne = (await call("getViewer", undefined, clientOne)).user;
  const identityTwo = (await call("getViewer", undefined, clientTwo)).user;
  const postId = "11111111-1111-4111-8111-111111111111",
    otherId = "22222222-2222-4222-8222-222222222222";
  for (const [id, author, title] of [
    [postId, identityOne.id, "Private fixture one"],
    [otherId, identityTwo.id, "Private fixture two"],
  ])
    await primary
      .prepare(
        "INSERT INTO posts (id,author_id,title,body,category,status,created_at,updated_at) VALUES (?,?,?,'Body','feature','planned',1,1)",
      )
      .bind(id, author, title)
      .run();
  await primary
    .prepare("INSERT INTO votes (post_id,user_id,created_at) VALUES (?,?,1)")
    .bind(postId, identityOne.id)
    .run();
  const [first, second] = await Promise.all([
    call("getPost", { id: postId }, clientOne),
    call("getPost", { id: postId }, clientTwo),
  ]);
  assert.equal(first.viewerHasVoted, true);
  assert.equal(second.viewerHasVoted, false);
  assert.equal((await call("getPost", { id: postId })).viewerHasVoted, false);
  const mine = await Promise.all([
    call("listMyPosts", {}, clientOne),
    call("listMyPosts", {}, clientTwo),
  ]);
  assert.deepEqual(
    mine.map((page) => page.items.map((post: any) => post.id)),
    [[postId], [otherId]],
  );
  assert.equal((await call("listMyPosts", {})).total, 0);
  assert.equal((await call("listPosts", {})).total, 2);
  assert.equal((await call("listComments", { postId })).total, 0);
  assert.equal((await call("getRoadmap", {})).planned.total, 2);
  const denied = await call(
    "setVote",
    { postId: otherId, voted: true, viewerId: identityOne.id },
    "",
    "POST",
  );
  assert.equal(denied.ok, false);
  assert.equal(denied.error.code, "unauthenticated");
  assert.equal((await primary.prepare("SELECT count(*) AS n FROM votes").first())?.n, 1);
  for (const cookie of [clientOne, clientTwo])
    for (const path of ["/", `/posts/${postId}`, "/my-feedback", "/roadmap"]) {
      const response = await app.fetch(`https://portal.example.com${path}`, {
        headers: { cookie },
      });
      const html = await response.text();
      assert.equal(response.status, 200);
      assert.match(html, /Loading feedback/);
      for (const forbidden of [
        "Client one",
        "Client two",
        "Private fixture one",
        "Private fixture two",
        identityOne.id,
        identityTwo.id,
      ])
        assert(!html.includes(forbidden), "no viewer/content data in document");
      assert.equal(response.headers.has("set-cookie"), false);
    }
  const meter = app;
  const usage: Record<string, Record<string, number>> = { unsigned: {}, signed: {} };
  for (const [label, cookie] of [
    ["unsigned", ""],
    ["signed", clientOne],
  ]) {
    for (const [name, data] of [
      ["getViewer", undefined],
      ["listPosts", {}],
      ["getPost", { id: postId }],
      ["listComments", { postId }],
      ["getRoadmap", {}],
      ["listMyPosts", {}],
    ] as const) {
      const url = new URL(`/_serverFn/${rpcId(name)}`, "https://portal.example.com");
      if (data !== undefined)
        url.searchParams.set("payload", JSON.stringify(await toJSONAsync({ data })));
      // Service binding fetches use their own internal request host; align Origin with it
      // by routing through a Request carrying the same canonical URL at the test entry.
      const response = await meter.fetch(url.href, {
        headers: {
          cookie,
          origin: "https://portal.example.com",
          "sec-fetch-site": "same-origin",
          "x-tsr-serverFn": "true",
        },
      });
      assert.equal(response.status, 200, `${name} metered RPC`);
      usage[label][name] = Number(response.headers.get("X-Local-D1-Reads"));
      await response.arrayBuffer();
    }
    const doc = await meter.fetch(`https://portal.example.com/posts/${postId}`, {
      headers: { cookie },
    });
    assert.equal(doc.status, 200);
    assert.equal(doc.headers.get("X-Local-D1-Reads"), "0");
    await doc.arrayBuffer();
  }
  assert.deepEqual(usage.unsigned, {
    getViewer: 0,
    listPosts: 2,
    getPost: 2,
    listComments: 3,
    getRoadmap: 6,
    listMyPosts: 0,
  });
  assert.deepEqual(usage.signed, {
    getViewer: 3,
    listPosts: 5,
    getPost: 5,
    listComments: 3,
    getRoadmap: 9,
    listMyPosts: 5,
  });
  console.log("local navigation D1 reads", JSON.stringify(usage));
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
    "ok: real workerd DB wrapper construction/binding/freshness/concurrent-params; injected host identities/token consumption; concurrent sessions/revocation; data-free deep-link shell; emitted private read RPCs and per-user votes/My feedback; protected mutation; controlled OAuth callback/state replay; mounted disabled routes",
  );
} finally {
  await runtime.dispose();
}
