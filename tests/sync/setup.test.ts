import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, test } from "vite-plus/test";
import { createNotionSetupClient, parseNotionId } from "../../src/integrations/notion.ts";
import { createGitHubSetupClient } from "../../src/integrations/github.ts";
import { createProviderRequest } from "../../src/integrations/request.ts";
import {
  GITHUB_API_VERSION,
  NOTION_SCHEMA,
  NOTION_VERSION,
} from "../../src/integrations/notion-schema.ts";
import type { NotionProperties } from "../../src/integrations/notion-schema.ts";
import { fakeFetch, list, text, notionRow, PAGE, SOURCE, DATABASE, PARENT } from "./helpers.ts";

const source = (properties: NotionProperties = NOTION_SCHEMA, title = "Feedbax", id = SOURCE) => ({
  id,
  title: text(title),
  parent: { type: "database_id", database_id: DATABASE },
  properties,
  in_trash: false,
});
const database = (title = "Feedbax") => ({
  id: DATABASE,
  url: `https://notion.so/${DATABASE}`,
  title: text(title),
  parent: { type: "page_id", page_id: PARENT },
  data_sources: [{ id: SOURCE }],
  in_trash: false,
});
const parent = {
  ...notionRow(),
  id: PARENT,
  properties: { title: { type: "title", title: text("Team") } },
};
const repo = {
  full_name: "acme/app",
  archived: false,
  has_issues: true,
  permissions: { pull: true, push: false },
};

describe("Notion setup", () => {
  test("validates the token with users/me and versioned JSON headers", async () => {
    const fake = fakeFetch({ name: "Feedbax integration" });
    expect(await createNotionSetupClient("notion_test", fake.fetch).me()).toEqual({
      name: "Feedbax integration",
    });
    expect(fake.requests[0]).toMatchObject({
      url: "https://api.notion.com/v1/users/me",
      method: "GET",
    });
    expect(fake.requests[0].headers.get("Authorization")).toBe("Bearer notion_test");
    expect(fake.requests[0].headers.get("Notion-Version")).toBe(NOTION_VERSION);
    expect(fake.requests[0].headers.get("Content-Type")).toBe("application/json");
  });
  test("discovers one duplicated template, retrieving the data source schema and parent title", async () => {
    const fake = fakeFetch(list([source()]), source(), database(), parent);
    const targets = await createNotionSetupClient("token", fake.fetch).findFeedbaxDataSources();
    expect(targets).toEqual([
      {
        dataSourceId: SOURCE,
        databaseId: DATABASE,
        parentTitle: "Team",
        url: `https://notion.so/${DATABASE}`,
      },
    ]);
    expect(fake.requests.map((r) => new URL(r.url).pathname)).toEqual([
      "/v1/search",
      `/v1/data_sources/${SOURCE}`,
      `/v1/databases/${DATABASE}`,
      `/v1/pages/${PARENT}`,
    ]);
    expect(fake.requests[0].body).toEqual({
      filter: { property: "object", value: "data_source" },
      page_size: 100,
    });
  });
  test("discovers multiple candidates across every search page by schema, regardless of title", async () => {
    const fake = fakeFetch(
      list([source()], "next"),
      source(),
      database(),
      parent,
      list([source(NOTION_SCHEMA, "Customer feedback", PAGE)]),
      source(NOTION_SCHEMA, "Customer feedback", PAGE),
      database("Another title"),
      parent,
    );
    const targets = await createNotionSetupClient("token", fake.fetch).findFeedbaxDataSources();
    expect(targets.map((target) => target.dataSourceId)).toEqual([SOURCE, PAGE]);
    expect(fake.requests[4].body.start_cursor).toBe("next");
  });
  test("returns no matches for unrelated wrong schema and excludes trashed data sources/databases", async () => {
    const fake = fakeFetch(
      list([
        source({}, "CRM"),
        { ...source(), id: "trash", in_trash: true },
        { ...source(), id: "trash-database" },
      ]),
      source({}, "CRM"),
      database("CRM"),
      source(),
      { ...database(), in_trash: true },
    );
    expect(await createNotionSetupClient("token", fake.fetch).findFeedbaxDataSources()).toEqual([]);
    expect(fake.requests.some((r) => r.url.endsWith("/data_sources/trash"))).toBe(false);
  });
  test("a Feedbax database title identifies a source whose own title changed and adds missing properties", async () => {
    const { Description: _description, ...partial } = NOTION_SCHEMA;
    const fake = fakeFetch(
      list([source(partial, "Custom title")]),
      source(partial, "Custom title"),
      database(),
      {},
      parent,
    );
    await createNotionSetupClient("token", fake.fetch).findFeedbaxDataSources();
    expect(fake.requests[3]).toMatchObject({
      method: "PATCH",
      url: `https://api.notion.com/v1/data_sources/${SOURCE}`,
      body: { properties: { Description: NOTION_SCHEMA.Description } },
    });
  });
  test("adds missing select options while preserving existing ones and custom columns", async () => {
    const properties = {
      ...NOTION_SCHEMA,
      Status: {
        type: "select",
        select: { options: [{ id: "open-id", name: "Open", color: "blue" }, { name: "Custom" }] },
      },
      Extra: { type: "number", number: {} },
    };
    const fake = fakeFetch(list([source(properties)]), source(properties), database(), {}, parent);
    await createNotionSetupClient("token", fake.fetch).findFeedbaxDataSources();
    expect(fake.requests[3].body).toEqual({
      properties: {
        Status: {
          select: {
            options: [
              { id: "open-id", name: "Open", color: "blue" },
              { name: "Custom" },
              { name: "Planned" },
              { name: "In progress" },
              { name: "Done" },
              { name: "Closed" },
            ],
          },
        },
      },
    });
  });
  test("rejects a mistyped required property on a named Feedbax source without replacing it", async () => {
    const wrong = { ...NOTION_SCHEMA, Status: { type: "status", status: {} } };
    const fake = fakeFetch(list([source(wrong)]), source(wrong), database());
    await expect(
      createNotionSetupClient("token", fake.fetch).findFeedbaxDataSources(),
    ).rejects.toMatchObject({
      provider: "notion",
      kind: "schema",
      message: "Notion property Status must have type select.",
    });
    expect(fake.requests.every((r) => r.method !== "PATCH")).toBe(true);
  });
  test("listPages excludes in_trash and caps at 100 accessible pages", async () => {
    const pages = Array.from({ length: 101 }, (_, i) => ({ ...parent, id: `page-${i}` }));
    const fake = fakeFetch(list([{ ...parent, in_trash: true }, ...pages]));
    expect(await createNotionSetupClient("token", fake.fetch).listPages()).toHaveLength(100);
    expect(fake.requests[0].body).toEqual({
      filter: { property: "object", value: "page" },
      page_size: 100,
    });
  });
  test("listPages continues search when trash fills the first search page", async () => {
    const fake = fakeFetch(list([{ ...parent, in_trash: true }], "more"), list([parent]));
    expect(await createNotionSetupClient("token", fake.fetch).listPages()).toEqual([
      { id: PARENT, title: "Team", url: parent.url },
    ]);
    expect(fake.requests[1].body.start_cursor).toBe("more");
  });
  test.each([
    PAGE,
    PAGE.replaceAll("-", ""),
    `https://www.notion.so/Team-${PAGE.replaceAll("-", "")}?pvs=4`,
    `https://acme.notion.site/Feedback-${PAGE.replaceAll("-", "")}`,
    `https://notion.so/${PAGE}`,
  ])("parses page UUID or URL %s", async (input) => {
    const fake = fakeFetch(notionRow());
    expect(await createNotionSetupClient("token", fake.fetch).getPage(input)).toMatchObject({
      id: PAGE,
    });
    expect(fake.requests[0].url).toBe(`https://api.notion.com/v1/pages/${PAGE}`);
  });
  test.each([
    "https://evil.example/" + PAGE,
    "https://notion.so.evil.example/" + PAGE,
    "http://notion.so/" + PAGE,
    "../../users/me",
    "invalid-id",
    "https://user:pass@notion.so/" + PAGE,
  ])("rejects unsafe/invalid page identifiers %s", (input) => {
    expect(() => parseNotionId(input)).toThrow();
  });
  test("a trashed page cannot be selected", async () => {
    const fake = fakeFetch({ ...parent, in_trash: true });
    await expect(
      createNotionSetupClient("token", fake.fetch).getPage(PARENT),
    ).rejects.toMatchObject({ kind: "schema" });
  });
  test("creates a database under a shared page with initial_data_source and returns its data source ID", async () => {
    const fake = fakeFetch(parent, database());
    const target = await createNotionSetupClient("token", fake.fetch).createDatabase(PARENT);
    expect(fake.requests[1]).toMatchObject({
      url: "https://api.notion.com/v1/databases",
      method: "POST",
      body: {
        parent: { type: "page_id", page_id: PARENT },
        title: [{ type: "text", text: { content: "Feedbax" } }],
        initial_data_source: { properties: NOTION_SCHEMA },
      },
    });
    expect(fake.requests[1].body).not.toHaveProperty("properties");
    expect(target).toEqual({
      dataSourceId: SOURCE,
      databaseId: DATABASE,
      parentTitle: "Team",
      url: database().url,
    });
  });
  test("database creation rejects a response with no data source", async () => {
    const fake = fakeFetch(parent, { ...database(), data_sources: [] });
    await expect(
      createNotionSetupClient("token", fake.fetch).createDatabase(PARENT),
    ).rejects.toMatchObject({ kind: "schema" });
  });
  test("creates a template page with guidance and one database, no sample rows", async () => {
    const fake = fakeFetch(parent, notionRow(), notionRow(), database());
    const result = await createNotionSetupClient("token", fake.fetch).createTemplatePage(PARENT);
    expect(result.pageUrl).toBe(notionRow().url);
    expect(result.target.dataSourceId).toBe(SOURCE);
    expect(fake.requests.map((r) => r.method)).toEqual(["GET", "POST", "GET", "POST"]);
    expect(fake.requests[1].body).toMatchObject({
      parent: { type: "page_id", page_id: PARENT },
      properties: { title: { type: "title", title: [{ text: { content: "Feedbax" } }] } },
    });
    expect(JSON.stringify(fake.requests[1].body.children)).toContain("Send to GitHub");
    expect(JSON.stringify(fake.requests[1].body.children)).toContain("public");
    expect(
      fake.requests.filter((r) => r.url.endsWith("/pages") && r.method === "POST"),
    ).toHaveLength(1);
  });
});

describe("GitHub setup", () => {
  test("validates a plain token with GET /user", async () => {
    const fake = fakeFetch({ login: "jesse" });
    expect(await createGitHubSetupClient("github_test", fake.fetch).me()).toEqual({
      login: "jesse",
    });
    expect(fake.requests[0].url).toBe("https://api.github.com/user");
    expect(fake.requests[0].headers.get("Authorization")).toBe("Bearer github_test");
    expect(fake.requests[0].headers.get("X-GitHub-Api-Version")).toBe(GITHUB_API_VERSION);
  });
  test("lists the first 100 visible repositories", async () => {
    const fake = fakeFetch([repo]);
    expect(await createGitHubSetupClient("token", fake.fetch).listRepos()).toEqual([
      { fullName: "acme/app", archived: false, hasIssues: true },
    ]);
    expect(fake.requests[0].url).toBe("https://api.github.com/user/repos?per_page=100&page=1");
  });
  test("verifies Issues write access with an invalid POST that creates nothing", async () => {
    const fake = fakeFetch(repo, new Response('{"message":"Validation Failed"}', { status: 422 }));
    expect(await createGitHubSetupClient("token", fake.fetch).checkRepo("acme/app")).toEqual({
      fullName: "acme/app",
      archived: false,
      hasIssues: true,
    });
    expect(
      fake.requests.map((r) => [r.method, new URL(r.url).pathname + new URL(r.url).search]),
    ).toEqual([
      ["GET", "/repos/acme/app"],
      ["POST", "/repos/acme/app/issues"],
    ]);
    // No title (or any field): GitHub can only answer 422, so no issue is ever created.
    expect(fake.requests[1].body).toEqual({});
  });
  test.each([
    { ...repo, archived: true },
    { ...repo, has_issues: false },
  ])("rejects unavailable Issues: %s", async (response) => {
    const fake = fakeFetch(response);
    await expect(
      createGitHubSetupClient("token", fake.fetch).checkRepo("acme/app"),
    ).rejects.toMatchObject({ provider: "github", kind: "permission" });
    expect(fake.requests).toHaveLength(1);
  });
  test.each([
    "https://github.com/acme/app",
    "acme",
    "acme/app/issues",
    "../app",
    "acme/..",
    "acme/app?token=secret",
  ])("rejects invalid repository input %s", async (input) => {
    const fake = fakeFetch();
    await expect(
      createGitHubSetupClient("token", fake.fetch).checkRepo(input),
    ).rejects.toMatchObject({ kind: "schema" });
    expect(fake.requests).toHaveLength(0);
  });
  test.each([403, 404])("%s on the write probe means the token cannot write", async (status) => {
    const fake = fakeFetch(repo, new Response("secret", { status }));
    const failure = createGitHubSetupClient("token", fake.fetch).checkRepo("acme/app");
    await expect(failure).rejects.toMatchObject({ kind: "permission", status });
    await expect(failure).rejects.toThrow("Issues: Read and write");
    await expect(failure).rejects.not.toThrow("secret");
  });
  test("410 on the write probe reports disabled Issues", async () => {
    const fake = fakeFetch(repo, new Response("", { status: 410 }));
    await expect(
      createGitHubSetupClient("token", fake.fetch).checkRepo("acme/app"),
    ).rejects.toMatchObject({ kind: "permission", status: 410 });
  });
  test("a rate-limited or failing write probe is not reported as a permission problem", async () => {
    const limited = fakeFetch(repo, new Response("", { status: 403, headers: { "Retry-After": "30" } }));
    await expect(
      createGitHubSetupClient("token", limited.fetch).checkRepo("acme/app"),
    ).rejects.toMatchObject({ kind: "rate_limit", retryAfterMs: 30_000 });
    const down = fakeFetch(repo, new Response("", { status: 503 }));
    await expect(
      createGitHubSetupClient("token", down.fetch).checkRepo("acme/app"),
    ).rejects.toMatchObject({ kind: "transient" });
  });
  test("an unexpected 2xx from the write probe is an error, not a pass", async () => {
    const fake = fakeFetch(repo, { number: 1 });
    await expect(
      createGitHubSetupClient("token", fake.fetch).checkRepo("acme/app"),
    ).rejects.toMatchObject({ kind: "schema" });
  });
});

describe("provider errors and Node compatibility", () => {
  test.each(["notion", "github"] as const)("missing %s token does not fetch", async (provider) => {
    const fake = fakeFetch();
    await expect(createProviderRequest(provider, "", fake.fetch)("/user")).rejects.toMatchObject({
      kind: "auth",
      status: 401,
    });
    expect(fake.requests).toHaveLength(0);
  });
  test.each([
    [400, "schema"],
    [401, "auth"],
    [403, "permission"],
    [404, "not_found"],
    [422, "schema"],
    [429, "rate_limit"],
    [503, "transient"],
  ] as const)("maps %s to %s without including provider bodies", async (status, kind) => {
    const fake = fakeFetch(
      new Response("SENTINEL_SECRET", { status, headers: { "Retry-After": "3" } }),
    );
    // A 403 with Retry-After is a GitHub-style rate limit; plain 403 is permission.
    const provider = status === 403 ? "notion" : "github";
    const plain = status === 403 ? fakeFetch(new Response("SENTINEL_SECRET", { status })) : fake;
    const promise = createProviderRequest(provider, "SENTINEL_SECRET", plain.fetch)("/user");
    await expect(promise).rejects.toMatchObject({ kind, status });
    await expect(promise).rejects.not.toThrow("SENTINEL_SECRET");
  });
  test("parses date Retry-After and uses the larger GitHub reset delay", async () => {
    const after = new Date(Date.now() + 120_000).toUTCString();
    const reset = Math.ceil(Date.now() / 1000) + 300;
    const fake = fakeFetch(
      new Response("limited", {
        status: 429,
        headers: { "Retry-After": after, "X-RateLimit-Reset": String(reset) },
      }),
    );
    try {
      await createGitHubSetupClient("token", fake.fetch).me();
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ kind: "rate_limit" });
      const delay = (error as { retryAfterMs: number }).retryAfterMs;
      expect(delay).toBeGreaterThanOrEqual(299_000);
      expect(delay).toBeLessThanOrEqual(301_000);
    }
  });
  test("invalid JSON is transient and never exposes raw content", async () => {
    const fake = fakeFetch(new Response("SENTINEL_SECRET"));
    await expect(createNotionSetupClient("token", fake.fetch).me()).rejects.toMatchObject({
      kind: "transient",
    });
  });
  test("fetch requests have a 10-second timeout and reject redirects", async () => {
    let signal: AbortSignal | undefined;
    let redirect: RequestRedirect | undefined;
    await createNotionSetupClient("token", async (_url, init) => {
      signal = init?.signal ?? undefined;
      redirect = init?.redirect;
      return Response.json({ name: null });
    }).me();
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal?.aborted).toBe(false);
    expect(redirect).toBe("error");
  });
  test("both setup modules load unbundled with Node 24 type stripping and no Cloudflare runtime", async () => {
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
      import { createNotionSetupClient } from './src/integrations/notion.ts';
      import { createGitHubSetupClient } from './src/integrations/github.ts';
      const fake = async (url) => Response.json(String(url).includes('notion') ? { name: 'ok' } : { login: 'ok' });
      console.log((await createNotionSetupClient('test', fake).me()).name, (await createGitHubSetupClient('test', fake).me()).login);
    `,
      ],
      { cwd: new URL("../../", import.meta.url) },
    );
    expect(stdout.trim()).toBe("ok ok");
  });
});
