import { mkdirSync, writeFileSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { toCrossJSON } from "seroval";
import type { Clients, Prompter, Run } from "../../packages/create-feedbax/src/types.ts";
import type { NotionSetupClient, NotionTarget } from "../../src/contracts/integrations.ts";
import { withoutComments } from "../../packages/create-feedbax/src/jsonc.ts";
import { Cancelled } from "../../packages/create-feedbax/src/flags.ts";
export const ID = "12345678-1234-4234-8234-123456789abc";
export const target: NotionTarget = {
  dataSourceId: ID,
  databaseId: ID,
  parentTitle: "Team dashboard",
  url: `https://www.notion.so/${ID}`,
};
export function fakeClients(
  targets = [target],
): Clients & { notionClient: NotionSetupClient; created: string[] } {
  const created: string[] = [];
  const notionClient: NotionSetupClient = {
    me: async () => ({ name: "Feedbax" }),
    prepareDataSource: async () => {},
    findFeedbaxDataSources: async () => targets,
    listPages: async () => [{ id: ID, title: "Team", url: target.url }],
    getPage: async () => ({ id: ID, title: "Team", url: target.url }),
    createDatabase: async (id) => {
      created.push(id);
      const createdTarget = { ...target, parentPageId: id };
      targets.push(createdTarget);
      return createdTarget;
    },
    createTemplatePage: async () => ({ pageUrl: target.url, target }),
  };
  return {
    notionClient,
    created,
    notion: () => notionClient,
    github: () => ({
      me: async () => ({ login: "team" }),
      listRepos: async () => [{ fullName: "team/app", archived: false, hasIssues: true }],
      checkRepo: async (fullName) => ({ fullName, archived: false, hasIssues: true }),
    }),
  };
}
export function scripted(inputs: (string | boolean | Error)[] = []): Prompter & { log: string[] } {
  const log: string[] = [];
  const next = <T>(fallback: T): T => {
    const value = inputs.length ? inputs.shift() : fallback;
    if (value instanceof Error) throw value;
    return value as T;
  };
  return {
    log,
    intro: (s) => {
      log.push(s);
    },
    note: (s, title) => {
      log.push(`${title ?? ""}\n${s}`);
    },
    info: (s) => {
      log.push(s);
    },
    error: (s) => {
      log.push(s);
    },
    outro: (s) => {
      log.push(s);
    },
    text: async (s, o) => {
      log.push(`${s} [default ${o?.defaultValue ?? ""}]`);
      return next(o?.defaultValue ?? "");
    },
    select: async (s, choices, initial) => {
      log.push(`${s} [default ${initial ?? choices[0]?.value}]`);
      return next(initial ?? choices[0]!.value);
    },
    confirm: async (s, initial = false) => {
      log.push(`${s} [default ${initial ? "Yes" : "No"}]`);
      return next(initial);
    },
    step: async (s, action) => {
      log.push(s);
      return action();
    },
  };
}
export function fakeCloudflare() {
  const state = {
    database: false,
    bucket: false,
    queue: false,
    notifyQueue: false,
    disabled: 0,
    taken: 0,
    subdomain: "team",
    fail: "",
    failed: false,
    calls: [] as string[],
    deploySecrets: {} as Record<string, string>,
    secretFile: "",
    login: true,
    cwd: "",
  };
  const run: Run = async (cmd, args, options) => {
    state.cwd = options.cwd;
    if (args.join(" ") === "run build") writeBuildFixture(options.cwd);
    const action = args.slice(args.indexOf("wrangler") + 1);
    const key = action.join(" ");
    state.calls.push(`${cmd} ${args.join(" ")}`);
    if (
      state.fail &&
      !state.failed &&
      (key.startsWith(state.fail) || args.join(" ").startsWith(state.fail))
    ) {
      state.failed = true;
      return { code: 1, stdout: "", stderr: "sentinel-secret-token" };
    }
    if (key === "whoami --json")
      return {
        code: state.login ? 0 : 1,
        stdout: JSON.stringify({
          loggedIn: state.login,
          accounts: [{ id: "account", name: "Team account" }],
        }),
        stderr: "",
      };
    if (key === "login") state.login = true;
    if (key === "auth token --json")
      return {
        code: 0,
        stdout: JSON.stringify({ type: "oauth", token: "sentinel-cloudflare-token" }),
        stderr: "",
      };
    if (key === "d1 list --json")
      return {
        code: 0,
        stdout: JSON.stringify(state.database ? [{ uuid: ID, name: "my-feedback-db" }] : []),
        stderr: "",
      };
    if (key.startsWith("d1 create")) state.database = true;
    if (key.startsWith("d1 info"))
      return { code: 0, stdout: JSON.stringify({ uuid: ID, name: "my-feedback-db" }), stderr: "" };
    if (key.startsWith("r2 bucket create")) state.bucket = true;
    if (key === "queues create my-feedback-sync") state.queue = true;
    if (key === "queues create my-feedback-notify") state.notifyQueue = true;
    if (key.startsWith("deploy")) {
      state.secretFile = action[2]!;
      state.deploySecrets = JSON.parse(readFileSync(state.secretFile, "utf8"));
      if ((statSync(dirname(state.secretFile)).mode & 0o777) !== 0o700)
        throw new Error("secrets directory must be private");
      if ((statSync(state.secretFile).mode & 0o777) !== 0o600)
        throw new Error("secrets-file must be private");
    }
    return { code: 0, stdout: "", stderr: "" };
  };
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    state.calls.push(`${init?.method ?? "GET"} ${url}`);
    if (!url.startsWith("https://api.cloudflare.com/")) return portalResponse(state.cwd, url, init);
    if (url.includes("/r2/buckets") && state.disabled-- > 0)
      return Response.json(
        { success: false, result: null, errors: [{ code: 10042, message: "Please enable R2" }] },
        { status: 403 },
      );
    if (url.includes("/r2/buckets"))
      return Response.json({
        success: true,
        result: { buckets: state.bucket ? [{ name: "my-feedback-images" }] : [] },
      });
    if (url.includes("/queues?"))
      return Response.json({
        success: true,
        result: [
          ...(state.queue ? [{ queue_name: "my-feedback-sync" }] : []),
          ...(state.notifyQueue ? [{ queue_name: "my-feedback-notify" }] : []),
        ],
      });
    if (init?.method === "PUT" && state.taken-- > 0)
      return Response.json(
        { success: false, errors: [{ message: "Subdomain already taken" }] },
        { status: 409 },
      );
    if (init?.method === "PUT") state.subdomain = JSON.parse(init.body as string).subdomain;
    return Response.json({ success: true, result: { subdomain: state.subdomain } });
  };
  return { state, run, fetch };
}
export const cancel = () => new Cancelled();

export function writeBuildFixture(cwd: string): void {
  mkdirSync(join(cwd, "dist/server/assets"), { recursive: true });
  writeFileSync(
    join(cwd, "dist/server/assets/functions-fixture.js"),
    'var getViewer_createServerFn_handler = createServerRpc({ id: "fixture-viewer" });',
  );
}
export function portalResponse(cwd: string, url: string, init?: RequestInit): Response {
  if (url.endsWith("/api/health")) return Response.json({ ok: true });
  const vars = Object.fromEntries(
    readFileSync(join(cwd, ".dev.vars"), "utf8")
      .trim()
      .split("\n")
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i), JSON.parse(line.slice(i + 1))];
      }),
  );
  if (url.includes("/_serverFn/fixture-viewer")) {
    const config = withoutComments(readFileSync(join(cwd, "feedbax.config.ts"), "utf8"));
    const appUrl = /["']?appUrl["']?\s*:\s*["']([^"']+)["']/.exec(config)?.[1] ?? null;
    return Response.json(
      toCrossJSON({
        result: {
          user: null,
          config: {
            appUrl,
            hostLogin: Boolean(appUrl && vars.FEEDBAX_HOST_SECRET),
            oauth: {
              github: Boolean(vars.GITHUB_CLIENT_ID && vars.GITHUB_CLIENT_SECRET),
              google: Boolean(vars.GOOGLE_CLIENT_ID && vars.GOOGLE_CLIENT_SECRET),
            },
          },
        },
      }),
    );
  }
  if (url.endsWith("/api/auth/sign-in/social")) {
    const provider = JSON.parse(init?.body as string).provider;
    const target = new URL(
      provider === "github"
        ? "https://github.com/login/oauth/authorize"
        : "https://accounts.google.com/o/oauth2/v2/auth",
    );
    target.searchParams.set("client_id", vars[`${provider.toUpperCase()}_CLIENT_ID`]);
    target.searchParams.set("redirect_uri", `${new URL(url).origin}/api/auth/callback/${provider}`);
    target.searchParams.set("state", "test-only-state");
    return Response.json(
      { url: target.href },
      { headers: { "set-cookie": "test-only-state=fixture; HttpOnly; Secure; SameSite=Lax" } },
    );
  }
  return new Response(null, { status: 404 });
}
