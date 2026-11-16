import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { createGitHubSetupClient } from "../../src/integrations/github.ts";
import { defineConfig } from "../../src/contracts/config.ts";
import { verifyAdminToken } from "../../src/server/admin-link.ts";
import { readVars } from "../../packages/create-feedbax/src/project.ts";
import { loadConfig } from "../../packages/feedbax/src/config-edit.ts";
import { main, parseArgs } from "../../packages/feedbax/src/index.ts";
import { VERSION } from "../../packages/feedbax/src/version.ts";
import { fakeClients, scripted } from "./fakes.ts";
import {
  AUTH_SECRET,
  cleanup,
  configSource,
  fakeRegistry,
  fakeWrangler,
  PORTAL,
  project,
  REGISTRY,
  template,
  wranglerJson,
} from "./feedbax-helpers.ts";

afterEach(cleanup);

const read = (cwd: string, path: string) => readFile(join(cwd, path), "utf8");

function harness(cwd: string, env: Record<string, string> = {}, remoteSecrets: string[] = []) {
  const wrangler = fakeWrangler(remoteSecrets);
  const prompt = scripted();
  const logged: string[] = [];
  const health = { ok: true, notion: "ok", github: "off" };
  const fetched: string[] = [];
  return {
    wrangler,
    prompt,
    logged,
    health,
    fetched,
    output: () => [...prompt.log, ...logged].join("\n"),
    deps: {
      cwd,
      env,
      run: wrangler.run,
      prompt,
      clients: fakeClients(),
      interactive: false,
      log: (line: string) => logged.push(line),
      fetch: (async (input: RequestInfo | URL) => {
        fetched.push(input instanceof Request ? input.url : input.toString());
        return Response.json(health);
      }) as typeof fetch,
    },
  };
}

describe("feedbax CLI surface", () => {
  it("--version and --help work everywhere, offline", async () => {
    for (const argv of [["--version"], ["migrate", "--version"], ["add", "email", "--version"]]) {
      const h = harness("/nonexistent");
      expect(await main(argv, h.deps)).toBe(0);
      expect(h.logged).toEqual([VERSION]);
    }
    for (const command of ["migrate", "add", "doctor", "deploy", "admin"]) {
      const h = harness("/nonexistent");
      expect(await main([command, "--help"], h.deps)).toBe(0);
      expect(h.logged[0]).toContain(`feedbax ${command}`);
    }
    const h = harness("/nonexistent");
    expect(await main(["--help"], h.deps)).toBe(0);
    expect(h.logged[0]).toContain("feedbax migrate [version]");
  });

  it("matches packages/feedbax/package.json", async () => {
    const pkg = JSON.parse(
      await readFile(new URL("../../packages/feedbax/package.json", import.meta.url), "utf8"),
    );
    const brand = await import("../../src/contracts/brand.ts");
    const creator = JSON.parse(
      await readFile(
        new URL("../../packages/create-feedbax/package.json", import.meta.url),
        "utf8",
      ),
    );
    expect(pkg.version).toBe(VERSION);
    expect(pkg.description).toBe(brand.FEEDBAX_DESCRIPTION);
    expect(pkg.engines).toEqual(creator.engines);
    expect(pkg.bin).toEqual({ feedbax: "dist/index.mjs" });
  });

  it("rejects unknown commands, flags and secrets in flags", () => {
    expect(() => parseArgs(["nope"])).toThrow("Unknown command");
    expect(() => parseArgs(["add", "github", "--token=x"])).toThrow("Secrets belong");
    expect(() => parseArgs(["migrate", "0.3.1", "0.5.0"])).toThrow("Too many");
    expect(parseArgs(["migrate", "0.3.1", "--dry-run", "--baseline=0.3.0"])).toMatchObject({
      command: "migrate",
      positionals: ["0.3.1"],
      values: { "--baseline": "0.3.0" },
    });
  });
});

describe("feedbax admin", () => {
  it("mints a link for wrangler's PORTAL_URL (not .dev.vars) that verifies", async () => {
    const cwd = await project();
    const h = harness(cwd);
    expect(await main(["admin"], h.deps)).toBe(0);
    const url = new URL(h.logged[0]!);
    expect(url.origin).toBe(PORTAL);
    expect(url.pathname).toBe("/admin/enter");
    const claims = await verifyAdminToken(url.searchParams.get("t"), AUTH_SECRET);
    expect(claims).not.toBeNull();
    expect(claims!.exp - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(15 * 60);
    expect(h.output()).not.toContain(AUTH_SECRET);
  });

  it("warns when .dev.vars is missing", async () => {
    const cwd = await project({}, { devVars: false });
    const h = harness(cwd);
    expect(await main(["admin"], h.deps)).toBe(2);
    expect(h.output()).toContain(".dev.vars is missing");
    expect(h.logged).toEqual([]);
  });
});

describe("feedbax add", () => {
  const deployCalls = [
    "npm run build",
    "wrangler d1 migrations apply DB --remote",
    "wrangler deploy",
  ];

  it("github: validates the repo, sets GITHUB_TOKEN and integrations.github, redeploys", async () => {
    const cwd = await project();
    const h = harness(cwd, { GITHUB_TOKEN: "ghp_FakeTokenForTests" });
    expect(await main(["add", "github", "--repo", "team/app", "--yes"], h.deps)).toBe(0);
    expect(h.wrangler.bulk).toEqual([{ GITHUB_TOKEN: "ghp_FakeTokenForTests" }]);
    expect(h.wrangler.calls).toEqual([
      expect.stringMatching(/^wrangler secret bulk /),
      ...deployCalls,
    ]);
    expect(await read(cwd, "feedbax.config.ts")).toBe(configSource('{ repo: "team/app" }'));
    expect((await readVars(cwd)).GITHUB_TOKEN).toBe("ghp_FakeTokenForTests");
    expect(h.output()).not.toContain("sentinel-");
  });

  for (const provider of ["github", "google"] as const) {
    it(`${provider}-login: prints the exact callback and sets the OAuth pair only in Cloudflare`, async () => {
      const cwd = await project();
      const upper = provider.toUpperCase();
      const clientId =
        provider === "github"
          ? "0123456789abcdefabcd"
          : "123456789-fake.apps.googleusercontent.com";
      const h = harness(cwd, {
        [`${upper}_CLIENT_ID`]: clientId,
        [`${upper}_CLIENT_SECRET`]: "sentinel-secret",
      });
      const before = {
        config: await read(cwd, "feedbax.config.ts"),
        vars: await read(cwd, ".dev.vars"),
      };
      expect(await main(["add", `${provider}-login`, "--yes"], h.deps)).toBe(0);
      expect(h.output()).toContain(`${PORTAL}/api/auth/callback/${provider}`);
      expect(h.wrangler.bulk).toEqual([
        {
          [`${upper}_CLIENT_ID`]: clientId,
          [`${upper}_CLIENT_SECRET`]: "sentinel-secret",
        },
      ]);
      expect(await read(cwd, "feedbax.config.ts")).toBe(before.config);
      expect(await read(cwd, ".dev.vars")).toBe(before.vars);
      expect(h.output()).not.toContain("sentinel-");
    });
  }

  it("github-login: --yes without the pair stops before any change", async () => {
    const cwd = await project();
    const h = harness(cwd);
    expect(await main(["add", "github-login", "--yes"], h.deps)).toBe(2);
    expect(h.wrangler.calls).toEqual([]);
  });

  it("host-login: writes appUrl and uploads FEEDBAX_HOST_SECRET only when Cloudflare lacks it", async () => {
    const cwd = await project();
    const missing = harness(cwd);
    expect(
      await main(
        ["add", "host-login", "--app-url", "https://app.example.com", "--yes"],
        missing.deps,
      ),
    ).toBe(0);
    expect(missing.wrangler.bulk).toEqual([
      { FEEDBAX_HOST_SECRET: (await readVars(cwd)).FEEDBAX_HOST_SECRET },
    ]);
    expect(await read(cwd, "feedbax.config.ts")).toContain(
      'defineConfig({\n  appUrl: "https://app.example.com",\n  name:',
    );
    expect(missing.output()).toContain("FeedbaxLink");

    const present = harness(cwd, {}, ["FEEDBAX_HOST_SECRET"]);
    expect(
      await main(
        ["add", "host-login", "--app-url=https://app2.example.com", "--yes"],
        present.deps,
      ),
    ).toBe(0);
    expect(present.wrangler.bulk).toEqual([]);
    expect(present.wrangler.calls[0]).toBe("wrangler secret list --format json");
    expect((await loadConfig(cwd)).appUrl).toBe("https://app2.example.com");
  });

  it("host-login: refuses localhost and never rotates a deployed key it cannot see", async () => {
    const cwd = await project();
    const local = harness(cwd);
    expect(
      await main(["add", "host-login", "--app-url", "http://localhost:3000", "--yes"], local.deps),
    ).toBe(2);
    const blind = await project({}, { devVars: { FEEDBAX_HOST_SECRET: "" } });
    const h = harness(blind, {}, ["FEEDBAX_HOST_SECRET"]);
    expect(
      await main(["add", "host-login", "--app-url", "https://app.example.com", "--yes"], h.deps),
    ).toBe(2);
    expect(h.output()).toContain("Cloudflare cannot show it");
    expect(h.wrangler.bulk).toEqual([]);
  });

  it("email: sets RESEND_API_KEY and notifications.email.from, which the config contract accepts", async () => {
    const cwd = await project();
    const h = harness(cwd, { RESEND_API_KEY: "re_ObviouslyFakeSentinelKey1234567890" });
    expect(
      await main(["add", "email", "--from", "Acme Feedback <feedback@acme.dev>", "--yes"], h.deps),
    ).toBe(0);
    expect(h.wrangler.bulk).toEqual([{ RESEND_API_KEY: "re_ObviouslyFakeSentinelKey1234567890" }]);
    expect((await readVars(cwd)).RESEND_API_KEY).toBe("re_ObviouslyFakeSentinelKey1234567890");
    expect(await read(cwd, "feedbax.config.ts")).toContain(
      '  notifications: { email: { from: "Acme Feedback <feedback@acme.dev>" } },\n  integrations:',
    );
    expect((await loadConfig(cwd)).notifications).toEqual({
      email: { from: "Acme Feedback <feedback@acme.dev>" },
    });
    // Running it again replaces the address in place.
    const again = harness(cwd, { RESEND_API_KEY: "re_ObviouslyFakeSentinelKey1234567890" });
    expect(await main(["add", "email", "--from=feedback@acme.dev", "--yes"], again.deps)).toBe(0);
    expect((await loadConfig(cwd)).notifications.email).toEqual({ from: "feedback@acme.dev" });
  });

  it("email: rejects a bad from-address before any change", async () => {
    const cwd = await project();
    const h = harness(cwd, { RESEND_API_KEY: "re_ObviouslyFakeSentinelKey1234567890" });
    expect(await main(["add", "email", "--from", "not an address", "--yes"], h.deps)).toBe(2);
    expect(h.wrangler.calls).toEqual([]);
  });

  it.each([
    ["invalid format", "not-a-resend-key", 200],
    ["revoked key", "re_ObviouslyFakeRevokedKey1234567890", 401],
    ["provider failure", "re_ObviouslyFakeValidKey1234567890", 503],
  ])("email: %s leaves config and secrets untouched", async (_label, key, status) => {
    const cwd = await project();
    const before = await read(cwd, "feedbax.config.ts");
    const vars = await read(cwd, ".dev.vars");
    const h = harness(cwd, { RESEND_API_KEY: key });
    h.deps.fetch = async () => Response.json({ name: "invalid_api_key" }, { status });
    expect(await main(["add", "email", "--from=feedback@acme.dev", "--yes"], h.deps)).toBe(2);
    expect(h.wrangler.calls).toEqual([]);
    expect(await read(cwd, "feedbax.config.ts")).toBe(before);
    expect(await read(cwd, ".dev.vars")).toBe(vars);
    expect(h.output()).not.toContain(key);
  });

  it("email: validates a sending-only key with a read-only request", async () => {
    const cwd = await project();
    const h = harness(cwd, { RESEND_API_KEY: "re_ObviouslyFakeSendingKey1234567890" });
    h.deps.fetch = async (input, init) => {
      expect(input).toBe("https://api.resend.com/domains");
      expect(init?.method ?? "GET").toBe("GET");
      expect(init?.headers).toEqual({ Authorization: `Bearer ${h.deps.env.RESEND_API_KEY}` });
      return Response.json({ name: "restricted_api_key" }, { status: 401 });
    };
    expect(await main(["add", "email", "--from=feedback@acme.dev", "--yes"], h.deps)).toBe(0);
    expect(h.wrangler.bulk).toHaveLength(1);
  });

  it("email: a network error leaves config and secrets untouched", async () => {
    const cwd = await project();
    const h = harness(cwd, { RESEND_API_KEY: "re_ObviouslyFakeSendingKey1234567890" });
    h.deps.fetch = async () => {
      throw new Error(h.deps.env.RESEND_API_KEY);
    };
    expect(await main(["add", "email", "--from=feedback@acme.dev", "--yes"], h.deps)).toBe(1);
    expect(h.wrangler.calls).toEqual([]);
    expect(await read(cwd, "feedbax.config.ts")).toBe(configSource());
    expect(h.output()).not.toContain(h.deps.env.RESEND_API_KEY);
  });

  it("email: cancelling the live key check exits 130 without changes", async () => {
    const cwd = await project();
    const before = await read(cwd, ".dev.vars");
    const h = harness(cwd, { RESEND_API_KEY: "re_ObviouslyFakeSendingKey1234567890" });
    h.deps.fetch = async () => {
      throw new DOMException("The operation was aborted", "AbortError");
    };
    expect(await main(["add", "email", "--from=feedback@acme.dev", "--yes"], h.deps)).toBe(130);
    expect(h.output()).toContain("Cancelled.");
    expect(h.wrangler.calls).toEqual([]);
    expect(await read(cwd, "feedbax.config.ts")).toBe(configSource());
    expect(await read(cwd, ".dev.vars")).toBe(before);
  });

  it("preflights unsupported config edits before uploading secrets", async () => {
    const cwd = await project();
    const config = configSource().replace("github: false", "github: getGithubConfig()");
    // A valid computed config can load but cannot be safely edited as a literal.
    const before = `const getGithubConfig = () => false;\n${config}`;
    await writeFile(join(cwd, "feedbax.config.ts"), before);
    const h = harness(cwd, { GITHUB_TOKEN: "ghp_ObviouslyFakeToken1234567890" });
    expect(await main(["add", "github", "--repo=team/app", "--yes"], h.deps)).toBe(2);
    expect(h.wrangler.calls).toEqual([]);
    expect(await read(cwd, "feedbax.config.ts")).toBe(before);
    expect((await readVars(cwd)).GITHUB_TOKEN).toBeUndefined();
  });

  it.each(["github", "email", "host-login"])(
    "%s: rejects a valid edit that misses the requested setting",
    async (integration) => {
      const cwd = await project();
      const before =
        integration === "github"
          ? `const unused = { github: false };\nconst github = false;\n${configSource("github")}`
          : integration === "email"
            ? `const unused = { email: false };\n${configSource()}`
            : `const unused = { appUrl: "https://old.example.com" };\nconst appUrl = "https://old.example.com";\n${configSource().replace("  name:", "  appUrl,\n  name:")}`;
      await writeFile(join(cwd, "feedbax.config.ts"), before);
      const vars = await read(cwd, ".dev.vars");
      const h = harness(cwd, {
        GITHUB_TOKEN: "ghp_ObviouslyFakeToken1234567890",
        RESEND_API_KEY: "re_ObviouslyFakeSentinelKey1234567890",
      });
      const flags =
        integration === "github"
          ? ["--repo=team/app"]
          : integration === "email"
            ? ["--from=feedback@acme.dev"]
            : ["--app-url=https://app.example.com"];
      expect(await main(["add", integration, ...flags, "--yes"], h.deps)).toBe(2);
      expect(h.output()).toContain("Nothing changed");
      expect(h.wrangler.bulk).toEqual([]);
      expect(await read(cwd, "feedbax.config.ts")).toBe(before);
      expect(await read(cwd, ".dev.vars")).toBe(vars);
    },
  );

  it("github: rejects a malformed token before checking access or changing files", async () => {
    const cwd = await project();
    const h = harness(cwd, { GITHUB_TOKEN: "not-a-github-token" });
    expect(await main(["add", "github", "--repo=team/app", "--yes"], h.deps)).toBe(2);
    expect(h.wrangler.calls).toEqual([]);
    expect(h.fetched).toEqual([]);
    expect(await read(cwd, "feedbax.config.ts")).toBe(configSource());
    expect((await readVars(cwd)).GITHUB_TOKEN).toBeUndefined();
  });

  it("rejects a proposed config that cannot preserve the existing sender literal", async () => {
    const cwd = await project();
    // A brace inside a valid display name makes the simple object edit ambiguous.
    const before = configSource().replace(
      "  integrations:",
      '  notifications: { email: { from: "Curly } <feedback@acme.dev>" } },\n  integrations:',
    );
    await writeFile(join(cwd, "feedbax.config.ts"), before);
    const h = harness(cwd, { RESEND_API_KEY: "re_ObviouslyFakeSentinelKey1234567890" });
    const vars = await read(cwd, ".dev.vars");
    expect(await main(["add", "email", "--from=feedback@acme.dev", "--yes"], h.deps)).toBe(2);
    expect(h.wrangler.calls).toEqual([]);
    expect(await read(cwd, "feedbax.config.ts")).toBe(before);
    expect(await read(cwd, ".dev.vars")).toBe(vars);
  });

  it.each(["github", "google"])("%s-login: rejects the wrong client ID shape", async (provider) => {
    const cwd = await project();
    const upper = provider.toUpperCase();
    const h = harness(cwd, {
      [`${upper}_CLIENT_ID`]: "not-an-oauth-id",
      [`${upper}_CLIENT_SECRET`]: "obviously-fake-secret",
    });
    expect(await main(["add", `${provider}-login`, "--yes"], h.deps)).toBe(2);
    expect(h.wrangler.calls).toEqual([]);
  });

  it("host-login: rejects a malformed saved secret before writing config", async () => {
    const cwd = await project({}, { devVars: { FEEDBAX_HOST_SECRET: "invalid" } });
    const h = harness(cwd);
    expect(
      await main(["add", "host-login", "--app-url=https://app.example.com", "--yes"], h.deps),
    ).toBe(2);
    expect(h.wrangler.bulk).toEqual([]);
    expect(await read(cwd, "feedbax.config.ts")).toBe(configSource());
  });

  it.each(["invalid", `${Buffer.alloc(32, 1).toString("base64url")}=`])(
    "host-login: rejects a malformed environment secret without checking Cloudflare",
    async (secret) => {
      const cwd = await project({}, { devVars: { FEEDBAX_HOST_SECRET: "" } });
      const vars = await read(cwd, ".dev.vars");
      const h = harness(cwd, { FEEDBAX_HOST_SECRET: secret });
      expect(
        await main(["add", "host-login", "--app-url=https://app.example.com", "--yes"], h.deps),
      ).toBe(2);
      expect(h.output()).toContain("canonical base64url");
      expect(h.wrangler.calls).toEqual([]);
      expect(await read(cwd, "feedbax.config.ts")).toBe(configSource());
      expect(await read(cwd, ".dev.vars")).toBe(vars);
    },
  );

  it.each(["/user", "/repos/team/app"])(
    "github: failed %s check writes no secrets",
    async (failedPath) => {
      const cwd = await project();
      const h = harness(cwd, { GITHUB_TOKEN: "ghp_ObviouslyFakeToken1234567890" });
      const requests: string[] = [];
      const fetch: typeof globalThis.fetch = async (input) => {
        const path = new URL(input instanceof Request ? input.url : input.toString()).pathname;
        requests.push(path);
        return path === failedPath
          ? Response.json({ message: "Bad credentials" }, { status: 401 })
          : Response.json({ login: "team" });
      };
      expect(
        await main(["add", "github", "--repo=team/app", "--yes"], {
          ...h.deps,
          clients: { ...h.deps.clients, github: createGitHubSetupClient },
          fetch,
        }),
      ).toBe(1);
      expect(requests).toContain(failedPath);
      expect(h.wrangler.calls).toEqual([]);
      expect(await read(cwd, "feedbax.config.ts")).toBe(configSource());
    },
  );

  it("writes config before secrets and reports changes plus recovery after deploy failure", async () => {
    const cwd = await project();
    const key = "re_ObviouslyFakeSentinelKey1234567890";
    const h = harness(cwd, { RESEND_API_KEY: key });
    const run: typeof h.deps.run = async (cmd, args, options) => {
      if (args.includes("bulk")) {
        expect((await loadConfig(cwd)).notifications.email).toEqual({ from: "feedback@acme.dev" });
        expect((await readVars(cwd)).RESEND_API_KEY).toBe(key);
      }
      const result = await h.wrangler.run(cmd, args, options);
      return args.includes("deploy") ? { ...result, code: 1, stderr: key } : result;
    };
    expect(
      await main(["add", "email", "--from=feedback@acme.dev", "--yes"], { ...h.deps, run }),
    ).toBe(1);
    expect(h.wrangler.bulk).toEqual([{ RESEND_API_KEY: key }]);
    expect(h.output()).toContain(
      "Changed: feedbax.config.ts; .dev.vars; Cloudflare secrets: RESEND_API_KEY.",
    );
    expect(h.output()).toContain("Recovery: npx feedbax deploy");
    expect(h.output()).not.toContain(key);
  });

  it("reports an uncertain secret upload with a command to retry the add", async () => {
    const cwd = await project();
    const h = harness(cwd, { RESEND_API_KEY: "re_ObviouslyFakeSentinelKey1234567890" });
    expect(
      await main(["add", "email", "--from=feedback@acme.dev", "--yes"], {
        ...h.deps,
        run: async () => ({ code: 1, stdout: "", stderr: "Upload interrupted" }),
      }),
    ).toBe(1);
    expect(h.output()).toContain("outcome is unknown");
    expect(h.output()).toContain(
      "Recovery: npx feedbax add email --from 'feedback@acme.dev' --yes",
    );
  });

  it("includes a newly written .gitignore in the recovery report", async () => {
    const cwd = await project();
    await rm(join(cwd, ".gitignore"), { force: true });
    const h = harness(cwd, { RESEND_API_KEY: "re_ObviouslyFakeSentinelKey1234567890" });
    expect(
      await main(["add", "email", "--from=feedback@acme.dev", "--yes"], {
        ...h.deps,
        run: async () => ({ code: 1, stdout: "", stderr: "Upload interrupted" }),
      }),
    ).toBe(1);
    expect(h.output()).toContain("Changed: feedbax.config.ts; .dev.vars; .gitignore.");
  });

  it("webhooks: explains /admin/settings and changes nothing", async () => {
    const cwd = await project();
    const h = harness(cwd);
    expect(await main(["add", "webhooks"], h.deps)).toBe(0);
    expect(h.output()).toContain(`${PORTAL}/admin/settings`);
    expect(h.output()).toContain("X-Feedbax-Signature");
    expect(h.wrangler.calls).toEqual([]);
  });
});

describe("feedbax doctor and deploy", () => {
  const secrets = ["BETTER_AUTH_SECRET", "FEEDBAX_HOST_SECRET", "NOTION_TOKEN"];
  const wrangler = wranglerJson(["/api/*", "/_serverFn/*", "/admin/enter", "/changelog.rss"]);

  it("passes on a healthy project", async () => {
    const cwd = await project({ "wrangler.jsonc": wrangler });
    const h = harness(cwd, {}, secrets);
    expect(await main(["doctor"], h.deps)).toBe(0);
    expect(h.fetched).toEqual([`${PORTAL}/api/health`]);
    expect(h.output()).toContain("All checks passed.");
  });

  it("does not ask for a Notion token when Notion sync is off", async () => {
    const off = JSON.parse(wrangler);
    off.vars.FEEDBAX_NOTION_ENABLED = "false";
    const cwd = await project({ "wrangler.jsonc": JSON.stringify(off) });
    const h = harness(cwd, {}, ["BETTER_AUTH_SECRET", "FEEDBAX_HOST_SECRET"]);
    expect(await main(["doctor"], h.deps)).toBe(0);
    expect(h.output()).not.toContain("NOTION_TOKEN");
  });

  it("fails with a concrete fix per problem", async () => {
    const cwd = await project({
      "feedbax.config.ts": configSource('{ repo: "team/app" }'),
      "wrangler.jsonc": wranglerJson(),
    });
    const h = harness(cwd, {}, ["BETTER_AUTH_SECRET", "NOTION_TOKEN", "GITHUB_CLIENT_ID"]);
    h.health.notion = "failing";
    h.health.github = "failing";
    expect(await main(["doctor"], h.deps)).toBe(1);
    const output = h.output();
    expect(output).toContain("assets.run_worker_first is missing /admin/enter");
    expect(output).toContain("Run npx wrangler secret put FEEDBAX_HOST_SECRET");
    expect(output).toContain("GITHUB_TOKEN is not set");
    expect(output).toContain("Run npx feedbax add github-login to set both.");
    expect(output).toContain("Notion sync is failing");
    expect(output).toContain("no GITHUB_TOKEN in .dev.vars");
  });

  it("asks for /changelog.rss when only the older routes are there", async () => {
    const cwd = await project({
      "wrangler.jsonc": wranglerJson(["/api/*", "/_serverFn/*", "/admin/enter"]),
    });
    const h = harness(cwd, {}, secrets);
    expect(await main(["doctor"], h.deps)).toBe(1);
    expect(h.output()).toContain("assets.run_worker_first is missing /changelog.rss");
    expect(h.output()).not.toContain("is missing /admin/enter");
  });

  it("reports an invalid config with its field names", async () => {
    const cwd = await project({
      "wrangler.jsonc": wrangler,
      "feedbax.config.ts": configSource().replace('name: "My feedback"', "name: 42 as never"),
    });
    const h = harness(cwd, {}, secrets);
    expect(await main(["doctor"], h.deps)).toBe(1);
    expect(h.output()).toContain("name: must be a string");
  });

  it("deploy builds, migrates, deploys", async () => {
    const cwd = await project();
    const h = harness(cwd);
    expect(await main(["deploy"], h.deps)).toBe(0);
    expect(h.wrangler.calls).toEqual([
      "npm run build",
      "wrangler d1 migrations apply DB --remote",
      "wrangler deploy",
    ]);
  });
});

describe("CLI update notice", () => {
  it("prints an update hint when interactive and a newer version is published, and stays silent offline or when suppressed", async () => {
    const cwd = await project();
    const registry = fakeRegistry([template("0.3.0", {}), template("0.3.2", {})]);
    const h = harness(cwd, { npm_config_registry: REGISTRY });
    expect(
      await main(["add", "webhooks"], {
        ...h.deps,
        interactive: true,
        fetch: registry.fetch,
      }),
    ).toBe(0);
    expect(h.output()).toContain(
      "Update available: 0.3.0 → 0.3.2. Run npx feedbax@latest migrate when ready.",
    );

    const offline = harness(cwd, { npm_config_registry: REGISTRY });
    expect(
      await main(["add", "webhooks"], {
        ...offline.deps,
        interactive: true,
        fetch: async () => {
          throw new Error("offline");
        },
      }),
    ).toBe(0);
    expect(offline.output()).not.toContain("Update available:");

    const suppressed = harness(cwd, { npm_config_registry: REGISTRY, NO_UPDATE_NOTIFIER: "1" });
    const beforeRequests = registry.requests.length;
    expect(
      await main(["add", "webhooks"], {
        ...suppressed.deps,
        interactive: true,
        fetch: registry.fetch,
      }),
    ).toBe(0);
    expect(registry.requests).toHaveLength(beforeRequests);
    expect(suppressed.output()).not.toContain("Update available:");
  });
});

describe("config contract: notifications.email", () => {
  const base = {
    integrations: { notion: { dataSourceId: "12345678-1234-4234-8234-123456789abc" } },
  };
  it("defaults to off and accepts a plain or named sender", () => {
    expect(defineConfig(base).notifications).toEqual({ email: false });
    expect(defineConfig({ ...base, notifications: { email: false } }).notifications.email).toBe(
      false,
    );
    for (const from of ["feedback@acme.dev", "Acme Feedback <feedback@acme.dev>"])
      expect(
        defineConfig({ ...base, notifications: { email: { from } } }).notifications.email,
      ).toEqual({ from });
  });
  it.each([
    ["no address", { email: { from: "Acme" } }, "notifications.email.from"],
    ["header injection", { email: { from: "a@acme.dev\nBcc: x@y.z" } }, "notifications.email.from"],
    ["not an object", { email: "a@acme.dev" }, "notifications.email"],
    ["wrong container", "yes", "notifications: must be an object"],
  ])("rejects %s", (_label, notifications, message) => {
    expect(() => defineConfig({ ...base, notifications } as never)).toThrow(message);
  });
});
