import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vite-plus/test";
import { main } from "../../packages/create-feedbax/src/index.ts";
import {
  chooseNotion,
  chooseRepo,
  validatedToken,
} from "../../packages/create-feedbax/src/flow.ts";
import { IntegrationError } from "../../src/contracts/integrations.ts";
import { buildTemplate } from "../../scripts/package-template.ts";
import { readVars } from "../../packages/create-feedbax/src/project.ts";
import { createNotionTemplate } from "../../scripts/create-notion-template.ts";
import { cancel, fakeClients, fakeCloudflare, ID, scripted, target } from "./fakes.ts";
const dirs: string[] = [];
async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "feedbax-test-"));
  dirs.push(cwd);
  const templateDir = join(cwd, "template");
  buildTemplate({ out: templateDir });
  const clients = fakeClients(),
    cf = fakeCloudflare(),
    prompt = scripted();
  const env = {
    NOTION_TOKEN: "sentinel-secret-token",
    GITHUB_TOKEN: "sentinel-github-token",
    CLOUDFLARE_API_TOKEN: "sentinel-cloudflare-token",
    CLOUDFLARE_ACCOUNT_ID: "account",
  };
  return { cwd, templateDir, clients, ...cf, prompt, env };
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});
describe("setup", () => {
  it("collects questions in order while installing; deploys and preserves private secrets on rerun", async () => {
    const f = await fixture();
    f.prompt = scripted(["my-feedback", "notion-github", false, "team/app", false]);
    expect(await main([], f)).toBe(0);
    const log = f.prompt.log.join("\n");
    const order = [
      "Project name",
      "Scaffold portal",
      "Dependencies are installing",
      "Template",
      "Connect Notion",
      "Using Feedbax",
      "Connect GitHub",
      "Which repository?",
      "Let people post without an account?",
      "Cloudflare login / check",
      "D1 create",
      "R2 create",
      "Queue create",
      "Write config",
      "Migrate",
      "Build + deploy",
      "You're live",
    ];
    let previous = -1;
    for (const item of order) {
      const index = log.indexOf(item);
      expect(index, item).toBeGreaterThan(previous);
      previous = index;
    }
    expect(log).toContain(
      "Read access verified; write access is checked when the first issue is created",
    );
    expect(log).toContain("[default No]");
    const project = join(f.cwd, "my-feedback");
    const before = await readVars(project);
    expect(before.BETTER_AUTH_SECRET).toHaveLength(43);
    expect(before.FEEDBAX_HOST_SECRET).toHaveLength(43);
    expect((await stat(join(project, ".dev.vars"))).mode & 0o777).toBe(0o600);
    expect(await readFile(join(project, ".gitignore"), "utf8")).toContain(".dev.vars");
    expect(f.state.deploySecrets.NOTION_TOKEN).toBe(f.env.NOTION_TOKEN);
    expect(f.state.deploySecrets.PORTAL_URL).toBeUndefined();
    await expect(stat(f.state.secretFile)).rejects.toThrow();
    expect(log).not.toContain("sentinel-");
    expect(f.state.calls.join("\n")).not.toContain("sentinel-");
    const count = f.state.calls.filter((c) =>
      /(?:d1 create|r2 bucket create|queues create)/.test(c),
    ).length;
    f.prompt = scripted([true, "notion-github", false]);
    expect(await main(["my-feedback"], f)).toBe(0);
    expect(await readVars(project)).toEqual(before);
    expect(
      f.state.calls.filter((c) => /(?:d1 create|r2 bucket create|queues create)/.test(c)),
    ).toHaveLength(count);
    const config = JSON.parse(await readFile(join(project, "wrangler.jsonc"), "utf8"));
    expect(config.vars.PORTAL_URL).toBe("https://my-feedback.team.workers.dev");
    expect(config.queues.consumers[0]).toMatchObject({
      max_concurrency: 1,
      max_batch_size: 1,
      max_retries: 10,
    });
  });
  it("offers OAuth, R2 enablement and taken-subdomain retry in place", async () => {
    const f = await fixture();
    f.state.disabled = 1;
    f.state.subdomain = "";
    f.state.taken = 1;
    f.state.login = false;
    f.env = { ...f.env, CLOUDFLARE_API_TOKEN: "", CLOUDFLARE_ACCOUNT_ID: "" };
    f.prompt = scripted(["my-feedback", "notion", false, false, "", "taken", "available"]);
    expect(await main([], f)).toBe(0);
    const log = f.prompt.log.join("\n");
    expect(log).toContain("Opening your browser");
    expect(log).toContain("Enable R2");
    expect(log).toContain("taken");
    expect(f.state.calls.findIndex((c) => c.includes("/r2/buckets"))).toBeLessThan(
      f.state.calls.findIndex((c) => c.includes("d1 create")),
    );
    expect(log).not.toContain("sentinel-cloudflare-token");
  });
  it.each([
    "run build",
    "d1 create",
    "d1 info",
    "r2 bucket create",
    "queues create",
    "d1 migrations apply DB --local",
    "d1 migrations apply DB --remote",
    "deploy",
  ])("resumes after %s without rotating secrets or duplicating resources", async (fail) => {
    const f = await fixture();
    f.state.fail = fail;
    const argv = ["my-feedback", "--yes"];
    expect(await main(argv, f)).toBe(1);
    const before = await readVars(join(f.cwd, "my-feedback"));
    const resources = { database: f.state.database, bucket: f.state.bucket, queue: f.state.queue };
    const callStart = f.state.calls.length;
    expect(await main(argv, f)).toBe(0);
    expect(await readVars(join(f.cwd, "my-feedback"))).toEqual(before);
    const later = f.state.calls.slice(callStart).join("\n");
    if (resources.database) expect(later).not.toContain("d1 create");
    if (resources.bucket) expect(later).not.toContain("r2 bucket create");
    if (resources.queue) expect(later).not.toContain("queues create");
    expect(f.prompt.log.join("\n")).not.toContain(f.env.NOTION_TOKEN);
    await expect(stat(f.state.secretFile)).rejects.toThrow();
  });
  it("refuses collisions on every fresh attempt before creating anything", async () => {
    const f = await fixture();
    f.state.queue = true;
    expect(await main(["my-feedback", "--yes"], f)).toBe(2);
    expect(await main(["my-feedback", "--yes"], f)).toBe(2);
    expect(f.state.calls.join("\n")).not.toMatch(/d1 create|r2 bucket create|queues create/);
  });
  it("cancels cleanly and removes only the fresh directory before remote work", async () => {
    const f = await fixture();
    f.prompt = scripted(["my-feedback", cancel()]);
    expect(await main([], f)).toBe(130);
    await expect(stat(join(f.cwd, "my-feedback"))).rejects.toThrow();
  });
  it("never prompts, opens a browser or writes with missing --yes input", async () => {
    const f = await fixture();
    f.env.NOTION_TOKEN = "";
    expect(await main(["my-feedback", "--yes"], f)).toBe(2);
    expect(await readdir(f.cwd)).toEqual(["template"]);
    expect(f.state.calls).toHaveLength(0);
    f.env.NOTION_TOKEN = "sentinel-secret-token";
    f.clients = fakeClients([]);
    expect(await main(["my-feedback", "--yes"], f)).toBe(2);
    expect(await readdir(f.cwd)).toEqual(["template"]);
  });
  it.each(["r2", "subdomain"])(
    "non-interactive %s prerequisites exit without a prompt",
    async (kind) => {
      const f = await fixture();
      if (kind === "r2") f.state.disabled = 1;
      else f.state.subdomain = "";
      expect(await main(["my-feedback", "--yes"], f)).toBe(1);
      expect(f.prompt.log.join("\n")).toContain("Retry:");
      expect(f.state.calls.join("\n")).not.toMatch(
        /d1 create|r2 bucket create|queues create| login/,
      );
    },
  );
});
describe("provider questions", () => {
  it("uses one match without a page question and lets users choose several", async () => {
    const c = fakeClients(),
      p = scripted();
    expect(
      await chooseNotion(c.notionClient, { yes: false, help: false, version: false }, p, () => {}),
    ).toEqual(target);
    expect(p.log.join("\n")).not.toContain("Where should");
    c.notionClient.findFeedbaxDataSources = async () => [
      target,
      { ...target, dataSourceId: "second", parentTitle: "Other" },
    ];
    expect(
      (
        await chooseNotion(
          c.notionClient,
          { yes: false, help: false, version: false },
          scripted(["second"]),
          () => {},
        )
      ).parentTitle,
    ).toBe("Other");
  });
  it("supports search again then paste when no template is found", async () => {
    const c = fakeClients([]),
      p = scripted(["search", "paste", `https://notion.so/${ID}`]);
    expect(
      await chooseNotion(c.notionClient, { yes: false, help: false, version: false }, p, () => {}),
    ).toEqual(target);
    expect(c.created).toEqual([ID]);
  });
  it("re-prompts a rejected token with specific guidance, supports network retry", async () => {
    const c = fakeClients();
    let calls = 0;
    c.notionClient.me = async () => {
      if (calls++ === 0) throw new IntegrationError("notion", "auth", 401, null, "token");
      return { name: null };
    };
    const p = scripted(["replacement"]);
    expect((await validatedToken("notion", "first", c, p, false)).token).toBe("replacement");
    expect(p.log.join("\n")).toContain("whole secret");
    calls = 0;
    c.notionClient.me = async () => {
      if (calls++ === 0) throw new TypeError("network");
      return { name: null };
    };
    expect((await validatedToken("notion", "token", c, scripted([true]), false)).token).toBe(
      "token",
    );
  });
  it("rejects archived/disabled repos without a test issue", async () => {
    const c = fakeClients().github("token");
    c.checkRepo = async (fullName) => ({ fullName, archived: true, hasIssues: true });
    await expect(
      chooseRepo(c, { yes: true, help: false, version: false, githubRepo: "team/app" }, scripted()),
    ).rejects.toThrow("archived");
    c.checkRepo = async (fullName) => ({ fullName, archived: false, hasIssues: false });
    await expect(
      chooseRepo(c, { yes: true, help: false, version: false, githubRepo: "team/app" }, scripted()),
    ).rejects.toThrow("Issues are disabled");
  });
  it("creates the template through W2's shared method", async () => {
    const c = fakeClients();
    expect(
      await createNotionTemplate(
        ["--parent-page", ID],
        { NOTION_TOKEN: "test-token" },
        c.notionClient,
      ),
    ).toBe(target.url);
    await expect(createNotionTemplate([], {}, c.notionClient)).rejects.toThrow("Usage");
    await expect(createNotionTemplate(["--parent-page", ID], {}, c.notionClient)).rejects.toThrow(
      "NOTION_TOKEN",
    );
  });
});

describe("failure boundaries", () => {
  it("keeps an existing non-Feedbax directory untouched", async () => {
    const f = await fixture();
    const { mkdir, writeFile } = await import("node:fs/promises");
    const project = join(f.cwd, "my-feedback");
    await mkdir(project);
    await writeFile(join(project, "keep.txt"), "keep");
    expect(await main(["my-feedback", "--yes"], f)).toBe(2);
    expect(await readdir(project)).toEqual(["keep.txt"]);
  });
  it.each(["NOTION_TOKEN", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "GITHUB_TOKEN"])(
    "missing %s makes --yes fail before writes",
    async (key) => {
      const f = await fixture();
      f.env = { ...f.env, [key]: "" };
      expect(
        await main(
          ["my-feedback", "--yes", "--template", "notion-github", "--github-repo", "team/app"],
          f,
        ),
      ).toBe(2);
      expect(await readdir(f.cwd)).toEqual(["template"]);
      expect(f.state.calls).toHaveLength(0);
    },
  );
  it("redacts an install failure and retries without rotating secrets", async () => {
    const f = await fixture();
    f.state.fail = "install";
    expect(await main(["my-feedback", "--yes"], f)).toBe(1);
    const before = await readVars(join(f.cwd, "my-feedback"));
    expect(await main(["my-feedback", "--yes"], f)).toBe(0);
    expect(await readVars(join(f.cwd, "my-feedback"))).toEqual(before);
    expect(f.prompt.log.join("\n")).not.toContain("sentinel-secret-token");
  });
  it("does not expose malformed saved secrets in errors", async () => {
    const f = await fixture();
    const { mkdir, writeFile } = await import("node:fs/promises");
    const project = join(f.cwd, "my-feedback");
    await mkdir(project);
    await writeFile(join(project, ".dev.vars"), 'NOTION_TOKEN="private-unclosed-secret');
    expect(await main(["my-feedback", "--yes"], f)).toBe(2);
    expect(f.prompt.log.join("\n")).not.toContain("private-unclosed-secret");
  });
  it("cancels token checks without offering a connection retry", async () => {
    const c = fakeClients(),
      p = scripted();
    c.notionClient.me = async () => {
      throw cancel();
    };
    await expect(validatedToken("notion", "token", c, p, false)).rejects.toThrow("cancelled");
    expect(p.log).toHaveLength(0);
  });
  it("recognizes W2 auth errors across separately bundled modules", async () => {
    const c = fakeClients(),
      p = scripted(["replacement"]);
    let count = 0;
    c.notionClient.me = async () => {
      if (count++ === 0)
        throw Object.assign(new Error("no"), { provider: "notion", kind: "auth", status: 401 });
      return { name: null };
    };
    expect((await validatedToken("notion", "token", c, p, false)).token).toBe("replacement");
    expect(p.log.join("\n")).toContain("whole secret");
  });
});
