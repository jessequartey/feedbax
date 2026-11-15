import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { createNotionTemplate } from "../../scripts/create-notion-template.ts";
import { createNotionSetupClient } from "../../src/integrations/notion.ts";
import { NOTION_SCHEMA, notionSchemaChanges } from "../../src/integrations/notion-schema.ts";
import type { NotionProperties } from "../../src/integrations/notion-schema.ts";
import { exampleDate } from "../../src/integrations/notion-template.ts";
import type { NotionSetupClient } from "../../src/contracts/integrations.ts";
import { DATABASE, PARENT, SOURCE, list, text } from "./helpers.ts";

const TOKEN = "ntn_test_only_sentinel";
const NEW_PAGE = "55555555-5555-4555-8555-555555555555";
const pageUrl = (id: string) => `https://www.notion.so/${id.replaceAll("-", "")}`;
const parentPage = {
  id: PARENT,
  url: pageUrl(PARENT),
  in_trash: false,
  properties: { title: { type: "title", title: text("Template page") } },
};
const source = {
  id: SOURCE,
  properties: Object.fromEntries(
    Object.entries(NOTION_SCHEMA).map(([name, schema]) => [name, { id: `id-${name}`, ...schema }]),
  ),
};

type Recorded = { method: string; path: string; body: Record<string, any> };
/** A Notion that answers by route, so the tests assert the sequence and bodies, not reply order. */
function fakeNotion(overrides: Record<string, () => unknown> = {}) {
  const log: Recorded[] = [];
  let views = 0;
  const fetchFn: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = init?.method ?? "GET";
    const path = url.pathname.replace(/^\/v1/, "") + url.search;
    log.push({ method, path, body: init?.body ? JSON.parse(init.body as string) : {} });
    const key = `${method} ${path}`;
    const reply = overrides[key]?.();
    if (reply !== undefined) return reply instanceof Response ? reply : Response.json(reply);
    if (key === "GET /users/me") return Response.json({ name: "Feedbax" });
    if (key === `GET /pages/${PARENT}`) return Response.json(parentPage);
    if (method === "GET" && path.startsWith("/blocks/")) return Response.json(list());
    if (key === `PATCH /pages/${PARENT}`) return Response.json(parentPage);
    if (key === "POST /pages" && "page_id" in (log.at(-1)!.body.parent ?? {}))
      return Response.json({ ...parentPage, id: NEW_PAGE, url: pageUrl(NEW_PAGE) });
    if (key === "POST /pages") return Response.json({ id: "row" });
    if (method === "PATCH" && path.endsWith("/children")) return Response.json(list());
    if (key === "POST /databases")
      return Response.json({
        id: DATABASE,
        url: `https://notion.so/${DATABASE}`,
        title: text("Feedbax"),
        parent: { type: "page_id", page_id: log.at(-1)!.body.parent.page_id },
        data_sources: [{ id: SOURCE }],
      });
    if (key === `GET /data_sources/${SOURCE}`) return Response.json(source);
    if (key === `GET /views?database_id=${DATABASE}`)
      return Response.json(list([{ id: "default" }]));
    if (key === "POST /views") return Response.json({ id: `view-${++views}` });
    if (key === "PATCH /views/default") return Response.json({ id: "default" });
    return Response.json({ message: `unrouted ${key}` }, { status: 500 });
  };
  const client = createNotionSetupClient(TOKEN, fetchFn);
  return { client, log, sequence: () => log.map((r) => `${r.method} ${r.path}`) };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const run = (argv: string[], client: NotionSetupClient) =>
  createNotionTemplate(argv, { NOTION_TOKEN: TOKEN }, client);
const printed = () =>
  vi
    .mocked(console.log)
    .mock.calls.map((call) => String(call[0]))
    .join("\n");

describe("option colours", () => {
  test("Status and Category options carry colours, in the board's column order", () => {
    expect(NOTION_SCHEMA.Status.select.options).toEqual([
      { name: "Open", color: "gray" },
      { name: "Planned", color: "blue" },
      { name: "In progress", color: "yellow" },
      { name: "Done", color: "green" },
      { name: "Closed", color: "red" },
    ]);
    expect(NOTION_SCHEMA.Category.select.options).toEqual([
      { name: "Feature request", color: "purple" },
      { name: "Bug report", color: "red" },
      { name: "General feedback", color: "gray" },
    ]);
  });
  test("validation matches options by name: other colours and extra options are never an error", () => {
    const properties: NotionProperties = {
      ...NOTION_SCHEMA,
      Status: {
        type: "select",
        select: {
          options: [
            { name: "Open", color: "pink" },
            { name: "Planned", color: "default" },
            { name: "In progress" },
            { name: "Done", color: "orange" },
            { name: "Closed", color: "brown" },
            { name: "Blocked", color: "purple" },
          ],
        },
      },
      Extra: { type: "number", number: {} },
    };
    expect(notionSchemaChanges(properties)).toEqual({});
    expect(notionSchemaChanges(properties, true)).toEqual({});
  });
  test("adding missing options keeps the user's options and colours, and colours only the new ones", () => {
    const properties: NotionProperties = {
      ...NOTION_SCHEMA,
      Status: {
        type: "select",
        select: {
          options: [
            { id: "a", name: "Open", color: "pink" },
            { id: "b", name: "Blocked", color: "purple" },
          ],
        },
      },
    };
    expect(notionSchemaChanges(properties, true)).toEqual({
      Status: {
        select: {
          options: [
            { id: "a", name: "Open", color: "pink" },
            { id: "b", name: "Blocked", color: "purple" },
            { name: "Planned", color: "blue" },
            { name: "In progress", color: "yellow" },
            { name: "Done", color: "green" },
            { name: "Closed", color: "red" },
          ],
        },
      },
    });
  });
});

describe("template via --page --examples", () => {
  test("fills the empty page, then the database, then the footer, then examples and views", async () => {
    const notion = fakeNotion();
    const url = await run(["--page", PARENT, "--examples"], notion.client);
    expect(url).toBe(pageUrl(PARENT));
    expect(notion.sequence()).toEqual([
      "GET /users/me",
      `GET /pages/${PARENT}`,
      `GET /blocks/${PARENT}/children?page_size=1`,
      `PATCH /pages/${PARENT}`,
      `PATCH /blocks/${PARENT}/children`,
      "POST /databases",
      `PATCH /blocks/${PARENT}/children`,
      "POST /pages",
      "POST /pages",
      "POST /pages",
      "POST /pages",
      `GET /data_sources/${SOURCE}`,
      `GET /views?database_id=${DATABASE}`,
      "POST /views",
      "PATCH /views/default",
    ]);
    const [, , , setPage, guide, database, footer, ...rest] = notion.log.slice(0);
    // Page properties
    expect(setPage!.body).toEqual({
      properties: { title: { title: [{ type: "text", text: { content: "Feedbax" } }] } },
      icon: { type: "emoji", emoji: "💬" },
      cover: {
        type: "external",
        external: { url: "https://www.notion.so/images/page-cover/gradients_8.png" },
      },
    });
    // Guide: grey paragraph, ONE callout with a bold title and 4 bullets, a collapsed-by-default toggle heading
    const blocks = guide!.body.children as Record<string, any>[];
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "callout", "heading_3"]);
    expect(blocks[0]!.paragraph.color).toBe("gray");
    expect(blocks[1]!.callout).toMatchObject({
      icon: { type: "emoji", emoji: "💡" },
      color: "gray_background",
      rich_text: [{ text: { content: "How this works" }, annotations: { bold: true } }],
    });
    expect(blocks[1]!.callout.children).toHaveLength(4);
    expect(blocks[1]!.callout.children.map((c: any) => c.type)).toEqual(
      Array(4).fill("bulleted_list_item"),
    );
    expect(JSON.stringify(blocks[1]!.callout.children[2])).toContain('"content":"Send to GitHub"');
    expect(blocks[2]!.heading_3).toMatchObject({
      is_toggleable: true,
      rich_text: [{ text: { content: "Getting started" } }],
    });
    expect(blocks[2]!.heading_3.children).toHaveLength(4);
    expect(blocks[2]!.heading_3.children.map((c: any) => c.type)).toEqual(
      Array(4).fill("numbered_list_item"),
    );
    expect(blocks[2]!.heading_3.children[1].numbered_list_item.rich_text).toEqual([
      { type: "text", text: { content: "Run " } },
      { type: "text", text: { content: "npx create-feedbax@latest" }, annotations: { code: true } },
      { type: "text", text: { content: ". Anonymous feedback is on." } },
    ]);
    const checklist = JSON.stringify(blocks[2]!.heading_3.children[3]);
    expect(checklist).toContain("npx feedbax admin");
    expect(checklist).toContain("/admin/settings");
    expect(checklist).toContain("npx feedbax add email");
    expect(checklist).toContain("npx feedbax add webhooks");
    // The database sits directly on the page, inline, with the one schema.
    expect(database!.body).toEqual({
      parent: { type: "page_id", page_id: PARENT },
      title: [{ type: "text", text: { content: "Feedbax" } }],
      is_inline: true,
      initial_data_source: { properties: NOTION_SCHEMA },
    });
    // Footer appended after the database existed: divider and a linked grey paragraph.
    expect(footer!.body.children.map((b: any) => b.type)).toEqual(["divider", "paragraph"]);
    expect(footer!.body.children[1].paragraph.color).toBe("gray");
    expect(footer!.body.children[1].paragraph.rich_text[1].text).toEqual({
      content: "github.com/jessequartey/feedbax",
      link: { url: "https://github.com/jessequartey/feedbax" },
    });
    // Example rows: no Feedbax ID, Created in the current month.
    const rows = rest.slice(0, 4);
    for (const row of rows) {
      expect(row.body.parent).toEqual({ type: "data_source_id", data_source_id: SOURCE });
      expect(row.body.properties).not.toHaveProperty("Feedbax ID");
      expect(row.body.properties.Created.date.start).toMatch(/^2026-11-\d\d$/);
    }
    expect(
      rows.map((r) => [
        r.body.properties.Name.title[0].text.content,
        r.body.properties.Category.select.name,
        r.body.properties.Status.select.name,
        r.body.properties.Votes.number,
      ]),
    ).toEqual([
      ["Example: Dark mode", "Feature request", "Planned", 12],
      ["Example: Crash on sign in", "Bug report", "Open", 8],
      ["Example: Team invites", "Feature request", "In progress", 19],
      ["Example: Roadmap labels", "General feedback", "Done", 5],
    ]);
    expect(rows.every((r) => r.body.properties.Description.rich_text[0].text.content)).toBe(true);
  });

  test("creates the board and renames the default table", async () => {
    const notion = fakeNotion();
    await run(["--page", PARENT], notion.client);
    const views = notion.log.filter((r) => r.path.startsWith("/views") && r.method !== "GET");
    const common = { database_id: DATABASE, data_source_id: SOURCE };
    expect(views).toHaveLength(2);
    expect(views[0]!.body).toMatchObject({
      ...common,
      name: "📋 Board",
      type: "board",
      position: { type: "start" },
      configuration: {
        type: "board",
        group_by: { type: "select", property_id: "id-Status", sort: { type: "manual" } },
      },
    });
    expect(views[1]).toMatchObject({ method: "PATCH", path: "/views/default" });
    expect(views[1]!.body).toEqual({ name: "🗂 All feedback" });
    expect(printed()).toContain("its 2 views");
    expect(printed()).not.toContain("Views need the browser");
  });

  test("the Views API failing keeps the page and prints the manual steps", async () => {
    const notion = fakeNotion({ "POST /views": () => new Response("nope", { status: 400 }) });
    expect(await run(["--page", PARENT], notion.client)).toBe(pageUrl(PARENT));
    expect(printed()).toContain("Views need the browser");
    expect(printed()).toContain("Could not create 📋 Board");
    expect(printed()).toContain(
      "2. 🗂 All feedback: layout Table (the default view, just renamed).",
    );
    expect(printed()).not.toContain("GitHub queue");
  });

  test("refuses a page that already has content, before changing anything", async () => {
    const notion = fakeNotion({
      [`GET /blocks/${PARENT}/children?page_size=1`]: () => list([{ id: "block" }]),
    });
    await expect(run(["--page", PARENT], notion.client)).rejects.toThrow("not empty");
    expect(notion.sequence()).toEqual([
      "GET /users/me",
      `GET /pages/${PARENT}`,
      `GET /blocks/${PARENT}/children?page_size=1`,
    ]);
  });
});

describe("template via --parent-page", () => {
  test("creates a child page carrying the guide, then the database and the footer", async () => {
    const notion = fakeNotion();
    expect(await run(["--parent-page", PARENT], notion.client)).toBe(pageUrl(NEW_PAGE));
    expect(notion.sequence().slice(0, 5)).toEqual([
      "GET /users/me",
      `GET /pages/${PARENT}`,
      "POST /pages",
      "POST /databases",
      `PATCH /blocks/${NEW_PAGE}/children`,
    ]);
    const page = notion.log[2]!.body;
    expect(page.parent).toEqual({ type: "page_id", page_id: PARENT });
    expect(page.icon).toEqual({ type: "emoji", emoji: "💬" });
    expect(page.cover.external.url).toContain("gradients_8.png");
    expect(page.children.map((b: any) => b.type)).toEqual(["paragraph", "callout", "heading_3"]);
    expect(notion.log[3]!.body.parent.page_id).toBe(NEW_PAGE);
    expect(notion.log.filter((r) => r.path === "/pages" && r.method === "POST")).toHaveLength(1);
  });
  test("creates no example rows unless asked", async () => {
    const notion = fakeNotion();
    await run(["--parent-page", PARENT], notion.client);
    expect(notion.log.some((r) => "data_source_id" in (r.body.parent ?? {}))).toBe(false);
  });
});

describe("script flags and secrets", () => {
  const noop = fakeNotion().client;
  test.each([
    [[]],
    [["--page"]],
    [["--page", PARENT, "--parent-page", PARENT]],
    [["--page", "not-a-page"]],
    [["--parent-page", PARENT, "--unknown"]],
    [[PARENT]],
  ])("rejects %j with the usage text", async (argv) => {
    await expect(createNotionTemplate(argv, { NOTION_TOKEN: TOKEN }, noop)).rejects.toThrow(
      "Usage",
    );
  });
  test("requires the token", async () => {
    await expect(createNotionTemplate(["--page", PARENT], {}, noop)).rejects.toThrow(
      "NOTION_TOKEN",
    );
  });
  test("never leaks the token in an error or the retry hint", async () => {
    const failing: NotionSetupClient = {
      ...noop,
      createTemplatePage: async () => {
        throw new Error(`boom with ${TOKEN} and Bearer ${TOKEN}`);
      },
    };
    const error = await createNotionTemplate(
      ["--page", PARENT, "--examples"],
      { NOTION_TOKEN: TOKEN },
      failing,
    ).catch((e: Error) => e);
    expect((error as Error).message).not.toContain("test_only_sentinel");
    expect((error as Error).message).toContain("Retry: npm run notion:template -- --page");
    expect((error as Error).message).toContain("--examples");
  });
  test("a Notion failure surfaces without the response body or token", async () => {
    const notion = fakeNotion({
      "POST /databases": () => new Response(`{"leak":"${TOKEN}"}`, { status: 400 }),
    });
    const error = await run(["--page", PARENT], notion.client).catch((e: Error) => e);
    expect((error as Error).message).toContain("notion returned 400");
    expect((error as Error).message).not.toContain(TOKEN);
  });
});

describe("example rows", () => {
  test("Created is a few days back, never before the 1st of the current month", () => {
    const now = new Date("2026-11-14T12:00:00Z");
    expect([4, 3, 2, 1].map((n) => exampleDate(now, n))).toEqual([
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
    ]);
    expect(exampleDate(new Date("2026-12-02T00:00:00Z"), 4)).toBe("2026-12-01");
  });
});
