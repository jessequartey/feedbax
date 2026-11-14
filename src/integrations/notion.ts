import type {
  FetchFn,
  NotionPageChoice,
  NotionSetupClient,
  NotionTarget,
} from "../contracts/integrations.ts";
import { NOTION_SCHEMA, notionSchemaChanges, richText, schemaError } from "./notion-schema.ts";
import type { NotionProperties } from "./notion-schema.ts";
import { createProviderRequest } from "./request.ts";

export type NotionText = { plain_text?: string; text?: { content: string } };
export type NotionPage = {
  id: string;
  url: string;
  in_trash?: boolean;
  properties: Record<
    string,
    {
      type?: string;
      title?: NotionText[];
      rich_text?: NotionText[];
      select?: { name: string } | null;
      checkbox?: boolean;
    }
  >;
};
export type NotionList<T> = { results: T[]; has_more: boolean; next_cursor: string | null };
type DataSource = {
  id: string;
  title: NotionText[];
  parent: { database_id: string };
  in_trash?: boolean;
  properties: NotionProperties;
};
type Database = {
  id: string;
  url: string;
  title: NotionText[];
  in_trash?: boolean;
  parent: { page_id?: string };
  data_sources: { id: string }[];
};

export function notionText(text: NotionText[] = []): string {
  return text.map((part) => part.plain_text ?? part.text?.content ?? "").join("");
}

export function parseNotionId(idOrUrl: string): string {
  let value = idOrUrl.trim();
  if (value.includes("://")) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw schemaError("Enter a Notion page URL or UUID.");
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !/(^|\.)notion\.(so|site)$/.test(url.hostname)
    ) {
      throw schemaError("Enter a notion.so or notion.site page URL.");
    }
    try {
      value = decodeURIComponent(url.pathname).split("/").filter(Boolean).at(-1) ?? "";
    } catch {
      throw schemaError("Enter a valid Notion page URL.");
    }
  }
  const match = value.match(
    /(?:^|-)([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i,
  );
  if (!match) throw schemaError("Enter a Notion page URL or UUID.");
  const hex = match[1].replaceAll("-", "").toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function pageChoice(page: NotionPage): NotionPageChoice {
  if (page.in_trash) throw schemaError("The selected Notion page is in trash.");
  const title = Object.values(page.properties).find(
    (property) => property.type === "title" || property.title,
  );
  return { id: page.id, title: notionText(title?.title) || "Untitled", url: page.url };
}

export function createNotionSetupClient(
  token: string,
  fetchFn: FetchFn = fetch,
): NotionSetupClient {
  const request = createProviderRequest("notion", token, fetchFn);
  const getPage = async (idOrUrl: string) =>
    pageChoice(await request<NotionPage>(`/pages/${parseNotionId(idOrUrl)}`));
  const target = async (source: DataSource, database: Database): Promise<NotionTarget> => ({
    dataSourceId: source.id,
    databaseId: database.id,
    parentTitle: database.parent.page_id
      ? (await getPage(database.parent.page_id)).title
      : notionText(database.title) || "Feedbax",
    url: database.url,
  });
  const createDatabase = async (pageId: string): Promise<NotionTarget> => {
    const page = await getPage(pageId);
    const database = await request<Database>("/databases", "POST", {
      parent: { type: "page_id", page_id: page.id },
      title: richText("Feedbax"),
      initial_data_source: { properties: NOTION_SCHEMA },
    });
    const dataSourceId = database.data_sources[0]?.id;
    if (!dataSourceId)
      throw schemaError("Notion did not return a data source for the new database.");
    return { dataSourceId, databaseId: database.id, parentTitle: page.title, url: database.url };
  };
  return {
    me: () => request<{ name: string | null }>("/users/me"),
    async findFeedbaxDataSources() {
      const targets: NotionTarget[] = [];
      let cursor: string | null = null;
      do {
        const result: NotionList<DataSource> = await request("/search", "POST", {
          filter: { property: "object", value: "data_source" },
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
        });
        for (const candidate of result.results) {
          if (candidate.in_trash) continue;
          const source = await request<DataSource>(`/data_sources/${candidate.id}`);
          if (source.in_trash) continue;
          const database = await request<Database>(`/databases/${source.parent.database_id}`);
          if (database.in_trash) continue;
          const named = [notionText(source.title), notionText(database.title)].some(
            (title) => title.trim().toLowerCase() === "feedbax",
          );
          if (!named) {
            try {
              notionSchemaChanges(source.properties);
            } catch {
              continue;
            }
          }
          const changes = notionSchemaChanges(source.properties, true);
          if (Object.keys(changes).length)
            await request(`/data_sources/${source.id}`, "PATCH", { properties: changes });
          targets.push(await target(source, database));
        }
        cursor = result.has_more ? result.next_cursor : null;
        if (result.has_more && !cursor)
          throw schemaError("Notion search returned no pagination cursor.");
      } while (cursor);
      return targets;
    },
    async listPages() {
      const pages: NotionPageChoice[] = [];
      let cursor: string | null = null;
      do {
        const result: NotionList<NotionPage> = await request("/search", "POST", {
          filter: { property: "object", value: "page" },
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
        });
        pages.push(...result.results.filter((page) => !page.in_trash).map(pageChoice));
        cursor = result.has_more ? result.next_cursor : null;
      } while (cursor && pages.length < 100);
      return pages.slice(0, 100);
    },
    getPage,
    createDatabase,
    async createTemplatePage(parentPageId) {
      const parent = await getPage(parentPageId);
      const page = await request<NotionPage>("/pages", "POST", {
        parent: { type: "page_id", page_id: parent.id },
        properties: { title: { type: "title", title: richText("Feedbax") } },
        children: [
          "Manage feedback with Status: Open, Planned, In progress, Done or Closed. Do not rename the required columns.",
          "Tick Send to GitHub to approve issue creation when GitHub is connected. Closing the issue makes Done final.",
          "Posts and attached images are public. Add your own columns and views freely.",
        ].map((text) => ({
          object: "block",
          type: "paragraph",
          paragraph: { rich_text: richText(text) },
        })),
      });
      return { pageUrl: page.url, target: await createDatabase(page.id) };
    },
  };
}
