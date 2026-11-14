import { expect, it, vi } from "vite-plus/test";
import { createNotionSetupClient } from "../../src/integrations/notion.ts";
import { NOTION_SCHEMA } from "../../src/integrations/notion-schema.ts";
import { fakeFetch, list, SOURCE, DATABASE, PARENT, text } from "./helpers.ts";
const partial = { ...NOTION_SCHEMA, Description: undefined };
function source(id: string, properties: unknown) {
  return { id, title: text("Feedbax"), parent: { database_id: DATABASE }, properties };
}
const database = {
  id: DATABASE,
  title: text("Feedbax"),
  parent: {},
  url: "https://notion.so/test",
};
it("discovery is read-only across candidates; only selected source is repaired", async () => {
  const fake = fakeFetch(
    list([source(SOURCE, partial), source(PARENT, partial)]),
    source(SOURCE, partial),
    database,
    source(PARENT, partial),
    database,
    source(PARENT, partial),
    {},
  );
  const client = createNotionSetupClient("token", fake.fetch);
  const candidates = await client.findFeedbaxDataSources();
  expect(candidates).toHaveLength(2);
  expect(fake.requests.filter((r) => r.method === "PATCH")).toEqual([]);
  await client.prepareDataSource(candidates[1]);
  expect(fake.requests.filter((r) => r.method === "PATCH").map((r) => r.url)).toEqual([
    `https://api.notion.com/v1/data_sources/${PARENT}`,
  ]);
});
it("an incompatible named candidate cannot hide a healthy one", async () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
  try {
    const wrong = { ...NOTION_SCHEMA, Status: { type: "status", status: {} } };
    const fake = fakeFetch(
      list([source(SOURCE, wrong), source(PARENT, NOTION_SCHEMA)]),
      source(SOURCE, wrong),
      database,
      source(PARENT, NOTION_SCHEMA),
      database,
    );
    const candidates = await createNotionSetupClient("token", fake.fetch).findFeedbaxDataSources();
    expect(candidates.map((c) => c.dataSourceId)).toEqual([PARENT]);
    expect(fake.requests.filter((r) => r.method === "PATCH")).toEqual([]);
    expect(warning).toHaveBeenCalled();
  } finally {
    warning.mockRestore();
  }
});
