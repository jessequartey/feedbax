import { chmod, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vite-plus/test";
import { parseJsonc } from "../../packages/create-feedbax/src/jsonc.ts";
import { main } from "../../packages/create-feedbax/src/index.ts";
import {
  chooseNotion,
  chooseRepo,
  validatedToken,
} from "../../packages/create-feedbax/src/flow.ts";
import { IntegrationError } from "../../src/contracts/integrations.ts";
import { buildTemplate } from "../../scripts/package-template.ts";
import {
  ensureSecrets,
  readVars,
  savedAnswers,
  scaffold,
  writeVars,
} from "../../packages/create-feedbax/src/project.ts";
import { createNotionTemplate } from "../../scripts/create-notion-template.ts";
import { cancel, fakeClients, fakeCloudflare, ID, scripted, target } from "./fakes.ts";
const dirs: string[] = [];
// The template is only ever read (scaffold copies from it), so build it once for the file.
let sharedTemplate = "";
beforeAll(async () => {
  sharedTemplate = await mkdtemp(join(tmpdir(), "feedbax-template-"));
  buildTemplate({ out: join(sharedTemplate, "template") });
});
afterAll(() => rm(sharedTemplate, { recursive: true, force: true }));
async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "feedbax-test-"));
  dirs.push(cwd);
  const templateDir = join(sharedTemplate, "template");
  const clients = fakeClients(),
    cf = fakeCloudflare(),
    prompt = scripted();
  const env = {
    NOTION_TOKEN: "sentinel-secret-token",
    GITHUB_TOKEN: "sentinel-github-token",
    GITHUB_CLIENT_ID: "sentinel-oauth-client",
    GITHUB_CLIENT_SECRET: "sentinel-oauth-secret",
    CLOUDFLARE_API_TOKEN: "sentinel-cloudflare-token",
    CLOUDFLARE_ACCOUNT_ID: "account",
  };
  return { cwd, templateDir, clients, ...cf, prompt, env };
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((p) => rm(p, { recursive: true, force: true })));
});
describe("setup", () => {
  it("verifies the real viewer RPC with the portal origin", async () => {
    const f = await fixture();
    const fetch = f.fetch;
    f.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input);
      if (
        url.pathname.startsWith("/_serverFn/") &&
        new Headers(init?.headers).get("origin") !== "https://my-feedback.team.workers.dev"
      )
        return new Response("Forbidden", { status: 403 });
      return fetch(input, init);
    };
    expect(await main(["my-feedback", "--yes"], f)).toBe(0);
  });
  it("persists the created D1 ID before Wrangler resolves its configured database binding", async () => {
    const f = await fixture();
    const originalRun = f.run;
    f.run = async (command, args, options) => {
      const action = args.slice(args.indexOf("wrangler") + 1);
      if (action[0] === "d1" && action[1] === "info") {
        const config = JSON.parse(
          await readFile(join(f.cwd, "my-feedback", "wrangler.jsonc"), "utf8"),
        );
        if (config.d1_databases[0].database_id !== ID)
          return { code: 1, stdout: "", stderr: "7404: configured database ID not found" };
      }
      return originalRun(command, args, options);
    };
    expect(await main(["my-feedback", "--yes"], f)).toBe(0);
    const config = JSON.parse(await readFile(join(f.cwd, "my-feedback", "wrangler.jsonc"), "utf8"));
    expect(config.d1_databases[0].database_id).toBe(ID);
    expect(f.state.calls.filter((call) => call.includes("d1 create"))).toHaveLength(1);
  });
  it("collects questions in order while installing; deploys and preserves private secrets on rerun", async () => {
    const f = await fixture();
    f.prompt = scripted(["my-feedback", false, "team/app"]);
    expect(await main(["--template", "notion-github"], f)).toBe(0);
    const log = f.prompt.log.join("\n");
    const order = [
      "Project name",
      "Scaffold portal",
      "Dependencies are installing",
      "Connect Notion",
      "Using Feedbax",
      "Connect GitHub",
      "Which repository?",
      "Cloudflare login / check",
      "D1 create",
      "R2 create",
      "Queue create",
      "Write config",
      "Migrate",
      "Build + deploy",
      "Portal deployed",
    ];
    let previous = -1;
    for (const item of order) {
      const index = log.indexOf(item);
      expect(index, item).toBeGreaterThan(previous);
      previous = index;
    }
    expect(log).toContain("Issues: write access verified");
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
    f.prompt = scripted([true, false]);
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
    f.prompt = scripted(["my-feedback", false, "", "taken", "available"]);
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
    expect(await readdir(f.cwd)).toEqual([]);
    expect(f.state.calls).toHaveLength(0);
    f.env.NOTION_TOKEN = "sentinel-secret-token";
    f.clients = fakeClients([]);
    expect(await main(["my-feedback", "--yes"], f)).toBe(2);
    expect(await readdir(f.cwd)).toEqual([]);
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
    ).toEqual({ ...target, parentPageId: ID });
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
  it("surfaces a missing Issues write permission from the repository check", async () => {
    const c = fakeClients().github("token");
    c.checkRepo = async () => {
      throw new IntegrationError(
        "github",
        "permission",
        403,
        null,
        "github token cannot write Issues in this repository. Grant Issues: Read and write.",
      );
    };
    await expect(
      chooseRepo(c, { yes: true, help: false, version: false, githubRepo: "team/app" }, scripted()),
    ).rejects.toThrow("cannot write Issues");
  });
  it("creates the template through the shared client method", async () => {
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
      expect(await readdir(f.cwd)).toEqual([]);
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

it("defaults anonymous on without asking, and clearly rejects conflicting reruns", async () => {
  const f = await fixture();
  const { scaffold } = await import("../../packages/create-feedbax/src/project.ts");
  await scaffold(join(f.cwd, "my-feedback"), f.templateDir, "my-feedback");
  f.prompt = scripted([true, false]);
  expect(await main(["my-feedback"], f)).toBe(0);
  expect(f.prompt.log.join("\n")).not.toContain("Let people post without an account?");
  expect(await readFile(join(f.cwd, "my-feedback", "feedbax.config.ts"), "utf8")).toContain(
    "anonymous: true",
  );
  f.prompt = scripted();
  expect(await main(["my-feedback", "--yes", "--anonymous=false"], f)).toBe(2);
  expect(f.prompt.log.join("\n")).toMatch(/conflict|already configured/);
});
it("resumes resource ownership from genuine JSONC and reads CRLF secrets", async () => {
  const f = await fixture();
  expect(await main(["my-feedback", "--yes"], f)).toBe(0);
  const { writeFile } = await import("node:fs/promises");
  const project = join(f.cwd, "my-feedback"),
    path = join(project, "wrangler.jsonc");
  const content = await readFile(path, "utf8");
  await writeFile(
    path,
    "// setup ownership\r\n" +
      content
        .replace('"vars": {', '"example": "https://example.com/a//b/*c*/",\n"vars": {')
        .replace(/\n}$/, ",\n}"),
  );
  expect(await main(["my-feedback", "--yes"], f)).toBe(0);
  await writeFile(
    join(project, ".dev.vars"),
    "PLAIN=plain\r\nSINGLE='single'\r\nDOUBLE=\"double\"\r\n",
  );
  expect(await readVars(project)).toEqual({ PLAIN: "plain", SINGLE: "single", DOUBLE: "double" });
});
it("cancelling Notion selection never repairs any candidate", async () => {
  const clients = fakeClients([
    target,
    { ...target, dataSourceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
  ]);
  let repairs = 0;
  clients.notionClient.prepareDataSource = async () => {
    repairs++;
  };
  await expect(
    chooseNotion(
      clients.notionClient,
      { yes: false, help: false, version: false },
      scripted([cancel()]),
      () => {},
    ),
  ).rejects.toThrow();
  expect(repairs).toBe(0);
});
it("resumes the identical --notion-page command after Cloudflare failure and rejects a different parent", async () => {
  const f = await fixture();
  f.clients = fakeClients([]);
  f.clients.notionClient.getPage = async (id) => ({ id, title: "Team", url: target.url });
  f.state.fail = "d1 create";
  const argv = ["my-feedback", "--yes", "--notion-page", ID];
  expect(await main(argv, f)).toBe(1);
  expect(await main(argv, f)).toBe(0);
  expect(f.clients.created).toEqual([ID]);
  const before = f.state.calls.length;
  f.prompt = scripted();
  expect(
    await main(
      ["my-feedback", "--yes", "--notion-page", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      f,
    ),
  ).toBe(2);
  expect(f.prompt.log.join("\n")).toMatch(/different|conflict/);
  expect(f.state.calls).toHaveLength(before);
});
it("provides an actionable resume command omitting only --notion-page when its parent cannot be verified", async () => {
  const f = await fixture();
  f.state.fail = "d1 create";
  const argv = [
    "my-feedback",
    "--yes",
    "--template=notion",
    "--anonymous=false",
    `--notion-page=${ID}`,
  ];
  expect(await main(argv, f)).toBe(1);
  f.prompt = scripted();
  expect(await main(argv, f)).toBe(2);
  const log = f.prompt.log.join("\n"),
    retry = log.split("Retry:").at(-1)!;
  expect(log).toContain("cannot be verified");
  expect(retry).toContain("--template=notion");
  expect(retry).toContain("--anonymous=false");
  expect(retry).not.toContain("--notion-page");
});

describe("minimal default setup", () => {
  async function minimal() {
    const f = await fixture();
    f.env = {
      NOTION_TOKEN: "sentinel-secret-token",
      CLOUDFLARE_API_TOKEN: "sentinel-cloudflare-token",
      CLOUDFLARE_ACCOUNT_ID: "account",
    } as typeof f.env;
    return f;
  }
  it("--yes needs only NOTION_TOKEN and Cloudflare credentials", async () => {
    const f = await minimal();
    f.clients.github = () => {
      throw new Error("Issues client must not be called");
    };
    expect(await main(["my-feedback", "--yes"], f)).toBe(0);
    const project = join(f.cwd, "my-feedback");
    const config = await readFile(join(project, "feedbax.config.ts"), "utf8");
    expect(config).toContain("anonymous: true");
    expect(config).toMatch(/github: false/);
    expect(Object.keys(f.state.deploySecrets).sort()).toEqual(
      ["BETTER_AUTH_SECRET", "FEEDBAX_HOST_SECRET", "NOTION_TOKEN"].sort(),
    );
    const log = f.prompt.log.join("\n");
    expect(log).not.toContain("Configure sign-in");
    expect(log).toContain("Anyone can post without an account");
    expect(log).toContain("npx feedbax add github-login");
  });
  it("interactive setup asks for the project name and the Notion link choice, nothing else", async () => {
    const f = await minimal();
    f.prompt = scripted(["my-feedback", false]);
    expect(await main([], f)).toBe(0);
    const questions = f.prompt.log.filter((line) => /\[default /.test(line));
    expect(questions).toEqual([
      "Project name [default my-feedback]",
      "Open the Notion setup links in your browser? [default No]",
    ]);
  });
  it("warns that nobody can post when anonymous is turned off without a provider", async () => {
    const f = await minimal();
    expect(await main(["my-feedback", "--yes", "--anonymous=false"], f)).toBe(0);
    expect(f.prompt.log.join("\n")).toContain("nobody can post");
  });
});
describe("selected login checkpoint", () => {
  it.each(["github", "google"] as const)(
    "requires the exact %s pair before noninteractive writes, never using an Issues PAT",
    async (login) => {
      const f = await fixture();
      delete (f.env as Record<string, string>).GITHUB_CLIENT_ID;
      delete (f.env as Record<string, string>).GITHUB_CLIENT_SECRET;
      expect(await main(["my-feedback", "--yes", `--login=${login}`, "--anonymous=true"], f)).toBe(
        2,
      );
      expect(await readdir(f.cwd)).toEqual([]);
      expect(f.state.calls).toEqual([]);
      const log = f.prompt.log.join("\n");
      expect(log).toContain(`${login.toUpperCase()}_CLIENT_ID`);
      expect(log).toContain(`${login.toUpperCase()}_CLIENT_SECRET`);
      expect(log).toContain("Run interactively");
      expect(log).not.toContain("Ready for feedback");
    },
  );
  it("Notion-only plus GitHub login from env does not use the Issues client or PAT", async () => {
    const f = await fixture();
    f.env.GITHUB_TOKEN = "";
    f.clients.github = () => {
      throw new Error("Issues client must not be called");
    };
    expect(await main(["my-feedback", "--yes"], f)).toBe(0);
    expect(f.state.deploySecrets.GITHUB_CLIENT_ID).toBe(f.env.GITHUB_CLIENT_ID);
    expect(f.state.deploySecrets.GITHUB_TOKEN).toBeUndefined();
    expect(f.prompt.log.join("\n")).toContain("GitHub sign-in is configured");
    expect(f.prompt.log.join("\n")).not.toContain("Ready for feedback");
  });
  it("discovers the exact custom callback before masked entry and refreshes deployment secrets", async () => {
    const f = await fixture();
    const project = join(f.cwd, "my-feedback");
    await scaffold(project, f.templateDir, "my-feedback");
    const config = parseJsonc(
      (await readFile(join(project, "wrangler.jsonc"), "utf8"))
        .replaceAll("feedbax-db", "my-feedback-db")
        .replaceAll("feedbax-images", "my-feedback-images")
        .replaceAll("feedbax-sync", "my-feedback-sync"),
    ) as {
      name: string;
      account_id: string;
      vars: { PORTAL_URL: string };
    };
    config.name = "my-feedback";
    config.account_id = "account";
    config.vars.PORTAL_URL = "https://feedback.example";
    await writeFile(join(project, "wrangler.jsonc"), JSON.stringify(config));
    delete (f.env as Record<string, string>).GITHUB_CLIENT_ID;
    delete (f.env as Record<string, string>).GITHUB_CLIENT_SECRET;
    f.prompt = scripted([true, false, "entered-client", "entered-oauth-secret"]);
    const text = f.prompt.text.bind(f.prompt);
    f.prompt.text = async (message, options) => {
      if (message === "OAuth client secret") {
        expect(options?.secret).toBe(true);
        expect(f.state.calls.join("\n")).not.toMatch(/d1 create|r2 bucket create|queues create/);
        expect(f.prompt.log.join("\n")).toContain("Homepage URL: https://feedback.example");
        expect(f.prompt.log.join("\n")).toContain(
          "Authorization callback URL: https://feedback.example/api/auth/callback/github",
        );
      }
      return text(message, options);
    };
    expect(await main(["my-feedback", "--login=github"], f)).toBe(0);
    expect(f.state.deploySecrets.GITHUB_CLIENT_ID).toBe("entered-client");
    expect(f.state.deploySecrets.GITHUB_CLIENT_SECRET).toBe("entered-oauth-secret");
    expect(f.state.deploySecrets.PORTAL_URL).toBeUndefined();
    expect((await readVars(project)).PORTAL_URL).toBe("http://localhost:3000");
    expect((await stat(join(project, ".dev.vars"))).mode & 0o777).toBe(0o600);
    expect(
      JSON.parse(await readFile(join(project, "wrangler.jsonc"), "utf8")).vars.PORTAL_URL,
    ).toBe("https://feedback.example");
    expect(f.prompt.log.join("\n")).not.toContain("entered-oauth-secret");
    const configText = await readFile(join(project, "feedbax.config.ts"), "utf8");
    expect(configText).not.toMatch(/entered-client|entered-oauth-secret|login:/);
  });
  it("persists and redacts new credentials immediately when the next resource command fails", async () => {
    const f = await fixture();
    delete (f.env as Record<string, string>).GITHUB_CLIENT_ID;
    delete (f.env as Record<string, string>).GITHUB_CLIENT_SECRET;
    f.prompt = scripted(["my-feedback", false, "captured-client", "captured-secret"]);
    const run = f.run;
    f.run = async (cmd, args, opts) => {
      if (args.includes("create") && args.includes("d1")) {
        expect((await stat(join(opts.cwd, ".dev.vars"))).mode & 0o777).toBe(0o600);
        expect((await readVars(opts.cwd)).GITHUB_CLIENT_SECRET).toBe("captured-secret");
        return { code: 1, stdout: "", stderr: "captured-client captured-secret" };
      }
      return run(cmd, args, opts);
    };
    expect(await main(["--login=github"], f)).toBe(1);
    expect(f.prompt.log.join("\n")).not.toMatch(/captured-client|captured-secret/);
    f.run = run;
    f.env.GITHUB_CLIENT_ID = "captured-client";
    f.env.GITHUB_CLIENT_SECRET = "captured-secret";
    expect(await main(["my-feedback", "--yes"], f)).toBe(0);
    expect(f.state.deploySecrets.GITHUB_CLIENT_SECRET).toBe("captured-secret");
  });
  it.each(["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"])(
    "rejects a new half-pair %s even when saved credentials could fill it",
    async (key) => {
      const f = await fixture();
      expect(await main(["my-feedback", "--yes"], f)).toBe(0);
      const project = join(f.cwd, "my-feedback"),
        before = await readFile(join(project, ".dev.vars"), "utf8");
      const env: Record<string, string> = { ...f.env, [key]: "new-half" };
      delete env[
        key.endsWith("_SECRET") ? key.replace("_SECRET", "_ID") : key.replace("_ID", "_SECRET")
      ];
      const callCount = f.state.calls.length;
      expect(await main(["my-feedback", "--yes"], { ...f, env })).toBe(2);
      expect(f.state.calls).toHaveLength(callCount);
      expect(await readFile(join(project, ".dev.vars"), "utf8")).toBe(before);
      expect(f.prompt.log.join("\n")).not.toContain("new-half");
    },
  );
  it("rejects saved half-pairs even when the explicit environment pair is complete", async () => {
    const f = await fixture(),
      project = join(f.cwd, "my-feedback");
    await scaffold(project, f.templateDir, "my-feedback");
    await writeVars(project, { GITHUB_CLIENT_ID: "stale-half" });
    expect(await main(["my-feedback", "--yes"], f)).toBe(2);
    expect(f.state.calls).toEqual([]);
    expect(await readVars(project)).toEqual({ GITHUB_CLIENT_ID: "stale-half" });
  });
  it("preserves both providers across explicit addition and infers Google or GitHub on resume", async () => {
    const f = await fixture();
    const env = f.env as Record<string, string>;
    delete env.GITHUB_CLIENT_ID;
    delete env.GITHUB_CLIENT_SECRET;
    env.GOOGLE_CLIENT_ID = "google-client";
    env.GOOGLE_CLIENT_SECRET = "google-secret";
    expect(await main(["my-feedback", "--yes"], f)).toBe(0);
    expect(f.prompt.log.join("\n")).toContain(
      "Authorized redirect URI: https://my-feedback.team.workers.dev/api/auth/callback/google",
    );
    expect(f.prompt.log.join("\n")).toContain("consent screen and test users");
    delete env.GOOGLE_CLIENT_ID;
    delete env.GOOGLE_CLIENT_SECRET;
    f.prompt = scripted();
    expect(await main(["my-feedback", "--yes"], f)).toBe(2);
    env.GOOGLE_CLIENT_ID = "google-client";
    env.GOOGLE_CLIENT_SECRET = "google-secret";
    expect(await main(["my-feedback", "--yes"], f)).toBe(0);
    expect(f.prompt.log.join("\n")).toContain("Google sign-in setup");
    env.GITHUB_CLIENT_ID = "github-client";
    env.GITHUB_CLIENT_SECRET = "github-secret";
    expect(await main(["my-feedback", "--yes", "--login=github"], f)).toBe(0);
    delete env.GITHUB_CLIENT_ID;
    delete env.GITHUB_CLIENT_SECRET;
    f.prompt = scripted();
    expect(await main(["my-feedback", "--yes"], f)).toBe(2);
    env.GITHUB_CLIENT_ID = "github-client";
    env.GITHUB_CLIENT_SECRET = "github-secret";
    expect(await main(["my-feedback", "--yes"], f)).toBe(0);
    expect(f.prompt.log.join("\n")).toContain("GitHub sign-in setup");
    expect(f.state.deploySecrets).toMatchObject({
      GITHUB_CLIENT_ID: "github-client",
      GOOGLE_CLIENT_ID: "google-client",
      GOOGLE_CLIENT_SECRET: "google-secret",
    });
  });
  it.each([undefined, "http://localhost:3000", "https://localhost:3000"])(
    "host setup rejects missing or local production app URL %s before writes",
    async (app) => {
      const f = await fixture();
      expect(
        await main(
          ["my-feedback", "--yes", "--login=host", ...(app ? [`--app-url=${app}`] : [])],
          f,
        ),
      ).toBe(2);
      expect(await readdir(f.cwd)).toEqual([]);
      expect(f.state.calls).toEqual([]);
    },
  );
  it("host-only resume preserves appUrl and keys and reports the pending host integration", async () => {
    const f = await fixture(),
      env = f.env as Record<string, string>;
    delete env.GITHUB_CLIENT_ID;
    delete env.GITHUB_CLIENT_SECRET;
    expect(
      await main(["my-feedback", "--yes", "--login=host", "--app-url=https://app.example"], f),
    ).toBe(0);
    const project = join(f.cwd, "my-feedback"),
      before = await readVars(project);
    expect((await savedAnswers(project)).appUrl).toBe("https://app.example");
    expect(await main(["my-feedback", "--yes"], f)).toBe(0);
    expect(await readVars(project)).toEqual(before);
    expect(f.prompt.log.join("\n")).toContain("Host login integration pending");
    expect(f.prompt.log.join("\n")).toContain("FeedbaxLink in https://app.example");
    expect(f.prompt.log.join("\n")).not.toContain("Ready for feedback");
    const commands = f.state.calls.join("\n");
    expect(commands).not.toContain("sign-in/social");
    expect(commands).not.toMatch(/ open | login/);
  });
  it("preserves providers in a hybrid host configuration", async () => {
    const f = await fixture();
    expect(
      await main(["my-feedback", "--yes", "--login=host", "--app-url=https://app.example"], f),
    ).toBe(0);
    expect(f.state.deploySecrets.GITHUB_CLIENT_SECRET).toBe(f.env.GITHUB_CLIENT_SECRET);
  });
  it("preserves customized completed TS config and rejects appUrl conflicts or additions before writes", async () => {
    const f = await fixture(),
      project = join(f.cwd, "my-feedback");
    expect(await main(["my-feedback", "--yes"], f)).toBe(0);
    const configPath = join(project, "feedbax.config.ts");
    let custom = (await readFile(configPath, "utf8")).replace(
      'name: "Feedbax"',
      'name: "Custom team"',
    );
    custom = "// keep customized configuration\n" + custom;
    await writeFile(configPath, custom);
    const before = await readFile(join(project, ".dev.vars"), "utf8"),
      calls = f.state.calls.length;
    expect(await main(["my-feedback", "--yes", "--app-url=https://app.example"], f)).toBe(2);
    expect(f.state.calls).toHaveLength(calls);
    expect(await readFile(configPath, "utf8")).toBe(custom);
    expect(await readFile(join(project, ".dev.vars"), "utf8")).toBe(before);
    custom = custom.replace("defineConfig({", 'defineConfig({ appUrl: "https://app.example",');
    await writeFile(configPath, custom);
    expect(await main(["my-feedback", "--yes", "--app-url=https://other.example"], f)).toBe(2);
    expect(await main(["my-feedback", "--yes"], f)).toBe(0);
    expect(await readFile(configPath, "utf8")).toBe(custom);
  });
  it("preserves settings and comments in zero-ID config while filling its literals", async () => {
    const f = await fixture(),
      project = join(f.cwd, "my-feedback");
    await scaffold(project, f.templateDir, "my-feedback");
    const path = join(project, "feedbax.config.ts");
    const custom = (await readFile(path, "utf8"))
      .replace('name: "Feedbax"', 'name: "Custom team"')
      .replace("  auth:", '  appUrl: "https://app.example",\n  auth:');
    await writeFile(path, "// anonymous: false\n" + custom);
    expect(await main(["my-feedback", "--yes", "--anonymous=true"], f)).toBe(0);
    const result = await readFile(path, "utf8");
    expect(result).toContain("// anonymous: false");
    expect(result).toContain('name: "Custom team"');
    expect(result).toContain("auth: { anonymous: true }");
    expect((await savedAnswers(project)).appUrl).toBe("https://app.example");
  });
  it("rejects dynamic appUrl instead of evaluating or overwriting TS", async () => {
    const f = await fixture(),
      project = join(f.cwd, "my-feedback");
    await scaffold(project, f.templateDir, "my-feedback");
    const path = join(project, "feedbax.config.ts"),
      original = await readFile(path, "utf8");
    const custom = original.replace("  auth:", "  appUrl: process.env.APP_URL,\n  auth:");
    await writeFile(path, custom);
    expect(await main(["my-feedback", "--yes"], f)).toBe(2);
    expect(f.state.calls).toEqual([]);
    expect(await readFile(path, "utf8")).toBe(custom);
  });
  it("refuses malformed existing host keys without rotating or echoing them", async () => {
    const f = await fixture(),
      project = join(f.cwd, "my-feedback");
    await scaffold(project, f.templateDir, "my-feedback");
    await writeVars(project, { FEEDBAX_HOST_SECRET: "existing-invalid-key" });
    expect(await main(["my-feedback", "--yes"], f)).toBe(2);
    expect((await readVars(project)).FEEDBAX_HOST_SECRET).toBe("existing-invalid-key");
    expect(f.prompt.log.join("\n")).not.toContain("existing-invalid-key");
    expect(f.state.calls).toEqual([]);
  });
  it("preserves a canonical host key longer than the minimum on resume", async () => {
    const f = await fixture();
    expect(await main(["my-feedback", "--yes"], f)).toBe(0);
    const project = join(f.cwd, "my-feedback");
    const key = Buffer.alloc(64, 7).toString("base64url");
    await writeVars(project, { ...(await readVars(project)), FEEDBAX_HOST_SECRET: key });
    expect(await main(["my-feedback", "--yes"], f)).toBe(0);
    expect((await readVars(project)).FEEDBAX_HOST_SECRET).toBe(key);
    expect(f.state.deploySecrets.FEEDBAX_HOST_SECRET).toBe(key);
  });
  it("blocks unattended deployment of saved localhost OAuth credentials on resume", async () => {
    const f = await fixture();
    expect(await main(["my-feedback", "--yes"], f)).toBe(0);
    const project = join(f.cwd, "my-feedback");
    await writeVars(project, {
      ...(await readVars(project)),
      GITHUB_CLIENT_ID: "development-client",
      GITHUB_CLIENT_SECRET: "development-secret",
    });
    delete (f.env as Record<string, string>).GITHUB_CLIENT_ID;
    delete (f.env as Record<string, string>).GITHUB_CLIENT_SECRET;
    const calls = f.state.calls.length;
    expect(await main(["my-feedback", "--yes"], f)).toBe(2);
    expect(f.state.calls).toHaveLength(calls);
    expect(f.state.deploySecrets.GITHUB_CLIENT_ID).toBe("sentinel-oauth-client");
    expect(f.prompt.log.join("\n")).toContain("production OAuth credentials");
    expect(f.prompt.log.join("\n")).not.toContain("development-secret");
  });
  it("requires an explicit confirmation of saved OAuth credentials for the production URL", async () => {
    const f = await fixture();
    expect(await main(["my-feedback", "--yes"], f)).toBe(0);
    delete (f.env as Record<string, string>).GITHUB_CLIENT_ID;
    delete (f.env as Record<string, string>).GITHUB_CLIENT_SECRET;
    f.prompt = scripted();
    const confirm = f.prompt.confirm.bind(f.prompt);
    let approveProduction = false;
    f.prompt.confirm = async (message, initial) => {
      if (message.startsWith("Deploy the saved")) {
        f.prompt.log.push(message);
        return approveProduction;
      }
      return confirm(message, initial);
    };
    const deployments = f.state.calls.filter((call) => call.includes("deploy")).length;
    expect(await main(["my-feedback"], f)).toBe(2);
    expect(f.state.calls.filter((call) => call.includes("deploy"))).toHaveLength(deployments);
    expect(f.prompt.log.join("\n")).toContain(
      "Deploy the saved GitHub OAuth credentials to https://my-feedback.team.workers.dev?",
    );
    approveProduction = true;
    expect(await main(["my-feedback"], f)).toBe(0);
  });
  it("tightens private vars permissions while preserving both pairs and signing keys", async () => {
    const f = await fixture(),
      project = join(f.cwd, "private");
    await mkdir(project);
    const initial = await ensureSecrets(project, {
      githubClientId: "gh-id",
      githubClientSecret: "gh-secret",
      googleClientId: "go-id",
      googleClientSecret: "go-secret",
    });
    await chmod(join(project, ".dev.vars"), 0o644);
    expect(await ensureSecrets(project, {})).toEqual(initial);
    expect((await stat(join(project, ".dev.vars"))).mode & 0o777).toBe(0o600);
    expect(await readFile(join(project, ".gitignore"), "utf8")).toContain(".dev.vars");
  });
  it("forces query-string redaction on fresh and resumed Wrangler configs", async () => {
    const f = await fixture();
    expect(await main(["my-feedback", "--yes"], f)).toBe(0);
    const path = join(f.cwd, "my-feedback", "wrangler.jsonc"),
      config = JSON.parse(await readFile(path, "utf8"));
    expect(config.observability).toMatchObject({ enabled: true, redact_query_string: true });
    config.observability.redact_query_string = false;
    config.observability.logs = { enabled: true, invocation_logs: false };
    await writeFile(path, JSON.stringify(config));
    expect(await main(["my-feedback", "--yes"], f)).toBe(0);
    expect(JSON.parse(await readFile(path, "utf8")).observability).toMatchObject({
      enabled: true,
      redact_query_string: true,
      logs: { enabled: true, invocation_logs: false },
    });
  });
  it("persists static-shell routing on fresh setup before provisioning resources", async () => {
    const f = await fixture(),
      run = f.run;
    let checked = false;
    f.run = async (command, args, options) => {
      if (args.includes("create") && args.includes("d1")) {
        const config = JSON.parse(await readFile(join(options.cwd, "wrangler.jsonc"), "utf8"));
        expect(config.assets).toEqual({
          not_found_handling: "single-page-application",
          run_worker_first: ["/api/*", "/_serverFn/*", "/admin/enter"],
        });
        checked = true;
      }
      return run(command, args, options);
    };
    expect(await main(["my-feedback", "--yes"], f)).toBe(0);
    expect(checked).toBe(true);
  });
  it.each([undefined, false, true, ["/legacy/*"]])(
    "repairs resumed static-shell routing from %j while preserving custom assets options",
    async (runWorkerFirst) => {
      const f = await fixture();
      f.state.fail = "d1 create";
      expect(await main(["my-feedback", "--yes"], f)).toBe(1);
      const path = join(f.cwd, "my-feedback", "wrangler.jsonc"),
        config = JSON.parse(await readFile(path, "utf8"));
      if (runWorkerFirst === undefined) delete config.assets;
      else
        config.assets = {
          directory: "./public",
          html_handling: "force-trailing-slash",
          not_found_handling: "404-page",
          run_worker_first: runWorkerFirst,
        };
      await writeFile(path, JSON.stringify(config));
      expect(await main(["my-feedback", "--yes"], f)).toBe(0);
      const expected = {
        ...(runWorkerFirst === undefined
          ? {}
          : { directory: "./public", html_handling: "force-trailing-slash" }),
        not_found_handling: "single-page-application",
        run_worker_first: ["/api/*", "/_serverFn/*", "/admin/enter"],
      };
      expect(JSON.parse(await readFile(path, "utf8")).assets).toEqual(expected);
      expect(await main(["my-feedback", "--yes"], f)).toBe(0);
      expect(JSON.parse(await readFile(path, "utf8")).assets).toEqual(expected);
    },
  );
  it.each(["health", "viewer", "start"])(
    "does not report success after failed %s wiring verification",
    async (step) => {
      const f = await fixture(),
        fetch = f.fetch;
      f.fetch = async (input, init) => {
        const url = input instanceof Request ? input.url : input.toString();
        if (
          (step === "health" && url.endsWith("/api/health")) ||
          (step === "viewer" && url.includes("/_serverFn/")) ||
          (step === "start" && url.endsWith("/api/auth/sign-in/social"))
        )
          return Response.json({ error: "verification failed" }, { status: 503 });
        return fetch(input, init);
      };
      expect(await main(["my-feedback", "--yes"], f)).toBe(1);
      expect(f.prompt.log.join("\n")).toContain("wiring verification failed");
      expect(f.prompt.log.join("\n")).not.toContain("GitHub sign-in is configured");
    },
  );
});

it("never asks a question or launches a browser during successful --yes setup", async () => {
  const f = await fixture();
  f.prompt.text = async () => {
    throw new Error("Unexpected text prompt");
  };
  f.prompt.select = async () => {
    throw new Error("Unexpected select prompt");
  };
  f.prompt.confirm = async () => {
    throw new Error("Unexpected confirmation prompt");
  };
  expect(await main(["my-feedback", "--yes"], f)).toBe(0);
  expect(f.state.calls.join("\n")).not.toMatch(/ open |xdg-open|explorer.exe|wrangler login/);
});
it("rejects a malformed canonical OAuth origin before resource creation", async () => {
  const f = await fixture();
  expect(await main(["my-feedback", "--yes"], f)).toBe(0);
  const path = join(f.cwd, "my-feedback", "wrangler.jsonc"),
    config = JSON.parse(await readFile(path, "utf8"));
  config.vars.PORTAL_URL = "https://feedback.example/path?private-value";
  await writeFile(path, JSON.stringify(config));
  f.state.calls.length = 0;
  f.prompt = scripted();
  expect(await main(["my-feedback", "--yes"], f)).toBe(2);
  expect(f.state.calls.join("\n")).not.toMatch(/d1 create|r2 bucket create|queues create|deploy/);
  expect(f.prompt.log.join("\n")).toContain("PORTAL_URL");
  expect(f.prompt.log.join("\n")).not.toContain("private-value");
});

it.each(["callback", "client", "provider", "state", "cookie"])(
  "rejects social start wiring with an incorrect %s",
  async (field) => {
    const f = await fixture(),
      fetch = f.fetch;
    f.fetch = async (input, init) => {
      const response = await fetch(input, init);
      const url = input instanceof Request ? input.url : input.toString();
      if (!url.endsWith("/api/auth/sign-in/social")) return response;
      const body = (await response.json()) as { url: string };
      const authorize = new URL(body.url);
      if (field === "callback")
        authorize.searchParams.set(
          "redirect_uri",
          "https://other.example/api/auth/callback/github",
        );
      if (field === "client") authorize.searchParams.set("client_id", "other-client");
      if (field === "provider") authorize.hostname = "other.example";
      if (field === "state") authorize.searchParams.delete("state");
      return Response.json(
        { url: authorize.href },
        { headers: field === "cookie" ? {} : response.headers },
      );
    };
    expect(await main(["my-feedback", "--yes"], f)).toBe(1);
    expect(f.prompt.log.join("\n")).not.toContain("GitHub sign-in is configured");
    expect(f.state.calls.join("\n")).not.toContain("GET https://github.com");
  },
);

it("resumes a completed config without OAuth or appUrl with no sign-in, and adds one on request", async () => {
  const f = await fixture();
  expect(await main(["my-feedback", "--yes"], f)).toBe(0);
  const project = join(f.cwd, "my-feedback"),
    vars = await readVars(project);
  delete vars.GITHUB_CLIENT_ID;
  delete vars.GITHUB_CLIENT_SECRET;
  await writeVars(project, vars);
  const env = f.env as Record<string, string>;
  delete env.GITHUB_CLIENT_ID;
  delete env.GITHUB_CLIENT_SECRET;
  const calls = f.state.calls.length;
  expect(await main(["my-feedback", "--yes"], f)).toBe(0);
  expect(f.state.calls.length).toBeGreaterThan(calls);
  expect(f.state.deploySecrets.GITHUB_CLIENT_ID).toBeUndefined();
  f.prompt = scripted([true, false, "legacy-client", "legacy-secret"]);
  expect(await main(["my-feedback", "--login=github"], f)).toBe(0);
  expect(f.prompt.log.join("\n")).not.toContain("How will people sign in?");
  expect(f.state.deploySecrets.GITHUB_CLIENT_SECRET).toBe("legacy-secret");
});

it("round-trips app URLs containing replacement syntax without corrupting TS", async () => {
  const f = await fixture(),
    appUrl = "https://app.example/path?return=$&value=$1";
  expect(await main(["my-feedback", "--yes", `--app-url=${appUrl}`], f)).toBe(0);
  const project = join(f.cwd, "my-feedback");
  expect((await savedAnswers(project)).appUrl).toBe(appUrl);
  expect(await main(["my-feedback", "--yes"], f)).toBe(0);
});
