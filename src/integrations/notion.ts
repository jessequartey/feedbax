import type {
  FetchFn,
  NotionPageChoice,
  NotionSetupClient,
  NotionTarget,
  NotionTemplateResult,
} from "../contracts/integrations.ts";
import { NOTION_SCHEMA, notionSchemaChanges, richText, schemaError } from "./notion-schema.ts";
import type { NotionProperties } from "./notion-schema.ts";
import {
  EXAMPLE_ROWS,
  TEMPLATE_COVER,
  TEMPLATE_ICON,
  TEMPLATE_TITLE,
  TEMPLATE_VIEWS,
  exampleProperties,
  footerBlocks,
  guideBlocks,
} from "./notion-template.ts";
import { createProviderRequest } from "./request.ts";
import type { ProviderRequest } from "./request.ts";

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
      !/(^|\.)notion\.(so|site|com)$/.test(url.hostname)
    ) {
      throw schemaError("Enter a Notion page URL (app.notion.com, notion.so or notion.site).");
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
  const createDatabaseIn = async (page: NotionPageChoice, inline: boolean) => {
    const database = await request<Database>("/databases", "POST", {
      parent: { type: "page_id", page_id: page.id },
      title: richText("Feedbax"),
      ...(inline ? { is_inline: true } : {}),
      initial_data_source: { properties: NOTION_SCHEMA },
    });
    const dataSourceId = database.data_sources[0]?.id;
    if (!dataSourceId)
      throw schemaError("Notion did not return a data source for the new database.");
    return { dataSourceId, databaseId: database.id, parentTitle: page.title, url: database.url };
  };
  const createDatabase = async (pageId: string): Promise<NotionTarget> =>
    createDatabaseIn(await getPage(pageId), false);
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
    async createTemplatePage(pageId, options = {}): Promise<NotionTemplateResult> {
      const parent = await getPage(pageId);
      let page: { id: string; url: string };
      if (options.fillPage) {
        const children = await request<NotionList<unknown>>(
          `/blocks/${parent.id}/children?page_size=1`,
        );
        if (children.results.length)
          throw schemaError(
            "That page is not empty. Fill an empty page, or use --parent-page to create a new page inside it.",
          );
        await request(`/pages/${parent.id}`, "PATCH", {
          properties: { title: { title: richText(TEMPLATE_TITLE) } },
          icon: TEMPLATE_ICON,
          cover: TEMPLATE_COVER,
        });
        await request(`/blocks/${parent.id}/children`, "PATCH", { children: guideBlocks() });
        page = parent;
      } else {
        page = await request<NotionPage>("/pages", "POST", {
          parent: { type: "page_id", page_id: parent.id },
          properties: { title: { type: "title", title: richText(TEMPLATE_TITLE) } },
          icon: TEMPLATE_ICON,
          cover: TEMPLATE_COVER,
          children: guideBlocks(),
        });
      }
      // A database created with a page parent is appended to the end of that page. Creating it
      // after the guide and before the footer puts the guide above it and the footer below it.
      const target = await createDatabaseIn({ ...page, title: TEMPLATE_TITLE }, true);
      await request(`/blocks/${page.id}/children`, "PATCH", { children: footerBlocks() });
      if (options.examples) {
        const now = new Date();
        for (const row of EXAMPLE_ROWS)
          await request("/pages", "POST", {
            parent: { type: "data_source_id", data_source_id: target.dataSourceId },
            properties: exampleProperties(row, now),
          });
      }
      return {
        pageUrl: page.url,
        target,
        views: await createTemplateViews(request, target),
      };
    },
  };
}

/** The Views API creates layout, grouping, filters and sorts. A failure never undoes the page. */
async function createTemplateViews(
  request: ProviderRequest,
  target: NotionTarget,
): Promise<{ created: boolean; error?: string }> {
  let current = "the views";
  try {
    const source = await request<DataSource>(`/data_sources/${target.dataSourceId}`);
    const ids: Record<string, string> = {};
    for (const [name, property] of Object.entries(source.properties))
      if (typeof property.id === "string") ids[name] = property.id;
    // Notion creates one table view with the database. It becomes "All feedback".
    const listed = await request<NotionList<{ id: string }>>(
      `/views?database_id=${target.databaseId}`,
    );
    const defaultViewId = listed.results[0]?.id;
    let boardId: string | undefined;
    for (const spec of TEMPLATE_VIEWS) {
      current = spec.name;
      if (!spec.body && defaultViewId) {
        await request(`/views/${defaultViewId}`, "PATCH", { name: spec.name });
        continue;
      }
      const view = await request<{ id: string }>("/views", "POST", {
        database_id: target.databaseId,
        data_source_id: target.dataSourceId,
        name: spec.name,
        ...(spec.body ? spec.body(ids) : { type: "table" }),
        ...(spec.position === "start" ? { position: { type: "start" } } : {}),
        ...(spec.position === "after-board" && boardId
          ? { position: { type: "after_view", view_id: boardId } }
          : {}),
      });
      if (spec.position === "start") boardId = view.id;
    }
    return { created: true };
  } catch (error) {
    return {
      created: false,
      error: `Could not create ${current}: ${error instanceof Error ? error.message : "request failed."}`,
    };
  }
}
