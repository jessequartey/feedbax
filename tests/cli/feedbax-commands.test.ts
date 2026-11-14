import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";
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
  fakeWrangler,
  PORTAL,
  project,
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
    expect(() => parseArgs(["migrate", "0.4.0", "0.5.0"])).toThrow("Too many");
    expect(parseArgs(["migrate", "0.4.0", "--dry-run", "--baseline=0.3.0"])).toMatchObject({
      command: "migrate",
      positionals: ["0.4.0"],
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
    const h = harness(cwd, { GITHUB_TOKEN: "sentinel-github-token" });
    expect(await main(["add", "github", "--repo", "team/app", "--yes"], h.deps)).toBe(0);
    expect(h.wrangler.bulk).toEqual([{ GITHUB_TOKEN: "sentinel-github-token" }]);
    expect(h.wrangler.calls).toEqual([
      expect.stringMatching(/^wrangler secret bulk /),
      ...deployCalls,
    ]);
    expect(await read(cwd, "feedbax.config.ts")).toBe(configSource('{ repo: "team/app" }'));
    expect((await readVars(cwd)).GITHUB_TOKEN).toBe("sentinel-github-token");
    expect(h.output()).not.toContain("sentinel-");
  });

  for (const provider of ["github", "google"] as const) {
    it(`${provider}-login: prints the exact callback and sets the OAuth pair only in Cloudflare`, async () => {
      const cwd = await project();
      const upper = provider.toUpperCase();
      const h = harness(cwd, {
        [`${upper}_CLIENT_ID`]: "sentinel-client",
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
          [`${upper}_CLIENT_ID`]: "sentinel-client",
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
    const h = harness(cwd, { RESEND_API_KEY: "re_sentinel" });
    expect(
      await main(["add", "email", "--from", "Acme Feedback <feedback@acme.dev>", "--yes"], h.deps),
    ).toBe(0);
    expect(h.wrangler.bulk).toEqual([{ RESEND_API_KEY: "re_sentinel" }]);
    expect((await readVars(cwd)).RESEND_API_KEY).toBe("re_sentinel");
    expect(await read(cwd, "feedbax.config.ts")).toContain(
      '  notifications: { email: { from: "Acme Feedback <feedback@acme.dev>" } },\n  integrations:',
    );
    expect((await loadConfig(cwd)).notifications).toEqual({
      email: { from: "Acme Feedback <feedback@acme.dev>" },
    });
    // Running it again replaces the address in place.
    const again = harness(cwd, { RESEND_API_KEY: "re_sentinel" });
    expect(await main(["add", "email", "--from=feedback@acme.dev", "--yes"], again.deps)).toBe(0);
    expect((await loadConfig(cwd)).notifications.email).toEqual({ from: "feedback@acme.dev" });
  });

  it("email: rejects a bad from-address before any change", async () => {
    const cwd = await project();
    const h = harness(cwd, { RESEND_API_KEY: "re_sentinel" });
    expect(await main(["add", "email", "--from", "not an address", "--yes"], h.deps)).toBe(2);
    expect(h.wrangler.calls).toEqual([]);
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
  const wrangler = wranglerJson(["/api/*", "/_serverFn/*", "/admin/enter"]);

  it("passes on a healthy project", async () => {
    const cwd = await project({ "wrangler.jsonc": wrangler });
    const h = harness(cwd, {}, secrets);
    expect(await main(["doctor"], h.deps)).toBe(0);
    expect(h.fetched).toEqual([`${PORTAL}/api/health`]);
    expect(h.output()).toContain("All checks passed.");
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
