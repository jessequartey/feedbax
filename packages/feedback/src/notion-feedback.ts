import type { PostStatus, PostType, PublicPostQuery } from "./index";
import type {
  FeedbackStorage,
  NewStoredPost,
  StoredPost,
} from "./feedback-storage";
import type { FeedbackPropertyIds } from "./notion-data-source";
import { requestNotion, type NotionRetryOptions } from "./notion-request";

const NOTION_API_URL = "https://api.notion.com/v1";
const NOTION_API_VERSION = "2026-03-11";

export interface NotionFeedbackStorageOptions {
  token: string;
  dataSourceId: string;
  propertyIds: FeedbackPropertyIds;
  request?: typeof fetch;
  retry?: NotionRetryOptions;
}

export function createNotionFeedbackStorage({
  token,
  dataSourceId,
  propertyIds,
  request = fetch,
  retry,
}: NotionFeedbackStorageOptions): FeedbackStorage {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Notion-Version": NOTION_API_VERSION,
  };
  const notionRequest = (
    input: Parameters<typeof fetch>[0],
    init: RequestInit = {},
  ) => requestNotion(input, init, { request, retry, operation: "idempotent" });

  const createStoredPost = async (item: NewStoredPost) => {
    const response = await requestNotion(
      `${NOTION_API_URL}/pages`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          parent: { type: "data_source_id", data_source_id: dataSourceId },
          properties: propertiesForCreate(item, propertyIds),
        }),
      },
      { request, retry, operation: "create" },
    );
    return postFromPage(await readNotionPage(response), propertyIds);
  };

  return {
    async create(item) {
      return createStoredPost(item);
    },
    async save(item) {
      const response = await notionRequest(
        `${NOTION_API_URL}/pages/${item.id}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            properties: propertiesForDraftEdit(item, propertyIds),
          }),
        },
      );
      return postFromPage(await readNotionPage(response), propertyIds);
    },
    async find(id) {
      const response = await notionRequest(`${NOTION_API_URL}/pages/${id}`, {
        method: "GET",
        headers,
      });
      if (response.status === 404) return undefined;
      return postFromPage(await readNotionPage(response), propertyIds);
    },
    async findBySlug(slug) {
      const response = await notionRequest(
        `${NOTION_API_URL}/data_sources/${dataSourceId}/query`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(slugQuery(slug, propertyIds)),
        },
      );
      const page = firstQueryResult(await readNotionPage(response));
      return page ? postFromPage(page, propertyIds) : undefined;
    },
    async findPublicBySlug(slug) {
      const query = new URLSearchParams();
      for (const propertyId of publicProjectionPropertyIds(propertyIds)) {
        query.append("filter_properties", propertyId);
      }
      const response = await notionRequest(
        `${NOTION_API_URL}/data_sources/${dataSourceId}/query?${query.toString()}`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            page_size: 1,
            filter: {
              and: [
                { property: propertyIds.slug, rich_text: { equals: slug } },
                {
                  property: propertyIds.published,
                  checkbox: { equals: true },
                },
              ],
            },
          }),
        },
      );
      const page = firstQueryResult(await readNotionPage(response));
      return page ? postFromPublicPage(page, propertyIds, true) : undefined;
    },
    async findByExternalId(externalId) {
      const response = await notionRequest(
        `${NOTION_API_URL}/data_sources/${dataSourceId}/query`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            page_size: 1,
            filter: {
              property: propertyIds.externalId,
              rich_text: { equals: externalId },
            },
          }),
        },
      );
      const value = await readNotionPage(response);
      const results = value.results;
      if (!Array.isArray(results) || results.length === 0) return undefined;
      const page = results[0];
      if (!page || typeof page !== "object" || Array.isArray(page)) {
        throw new Error("Notion returned an invalid Post list.");
      }
      return postFromPage(page as Record<string, unknown>, propertyIds);
    },
    async list() {
      throw new Error("Notion public retrieval is not implemented yet.");
    },
    async listPublic(query) {
      const response = await queryPublicPosts({
        request: notionRequest,
        headers,
        dataSourceId,
        propertyIds,
        body: publicListQuery(query, propertyIds),
      });
      return {
        items: response.results.map((page) =>
          postFromPublicPage(page, propertyIds, true),
        ),
        ...(response.nextCursor ? { nextCursor: response.nextCursor } : {}),
      };
    },
    async listPublicRoadmap() {
      const response = await queryPublicPosts({
        request: notionRequest,
        headers,
        dataSourceId,
        propertyIds,
        body: publicRoadmapQuery(propertyIds),
      });
      if (response.hasMore) {
        throw new Error(
          "Notion returned more public roadmap items than one query can serve.",
        );
      }
      return response.results.map((page) =>
        postFromPublicPage(page, propertyIds, true),
      );
    },
    async remove(id) {
      const response = await notionRequest(`${NOTION_API_URL}/pages/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ in_trash: true }),
      });
      await readNotionPage(response);
    },
  };
}

function publicListQuery(
  query: PublicPostQuery,
  ids: FeedbackPropertyIds,
): Record<string, unknown> {
  return {
    page_size: 25,
    ...(query.cursor ? { start_cursor: query.cursor } : {}),
    filter: {
      and: [
        { property: ids.published, checkbox: { equals: true } },
        ...(query.type
          ? [{ property: ids.type, select: { equals: query.type } }]
          : []),
        ...(query.status
          ? [{ property: ids.status, select: { equals: query.status } }]
          : []),
        ...(query.types?.length
          ? [
              {
                or: query.types.map((type) => ({
                  property: ids.type,
                  select: { equals: type },
                })),
              },
            ]
          : []),
        ...(query.statuses?.length
          ? [
              {
                or: query.statuses.map((status) => ({
                  property: ids.status,
                  select: { equals: status },
                })),
              },
            ]
          : []),
        ...(query.search
          ? [
              {
                or: [
                  { property: ids.title, title: { contains: query.search } },
                  {
                    property: ids.description,
                    rich_text: { contains: query.search },
                  },
                ],
              },
            ]
          : []),
      ],
    },
    sorts: [{ property: ids.createdAt, direction: "descending" }],
  };
}

function slugQuery(
  slug: string,
  ids: FeedbackPropertyIds,
): Record<string, unknown> {
  return {
    page_size: 1,
    filter: { property: ids.slug, rich_text: { equals: slug } },
  };
}

function publicRoadmapQuery(ids: FeedbackPropertyIds): Record<string, unknown> {
  return {
    page_size: 100,
    filter: {
      and: [
        { property: ids.published, checkbox: { equals: true } },
        {
          or: ["Planned", "In Progress", "Shipped"].map((status) => ({
            property: ids.status,
            select: { equals: status },
          })),
        },
      ],
    },
    sorts: [{ property: ids.updatedAt, direction: "descending" }],
  };
}

async function queryPublicPosts({
  request,
  headers,
  dataSourceId,
  propertyIds,
  body,
}: {
  request: typeof fetch;
  headers: Record<string, string>;
  dataSourceId: string;
  propertyIds: FeedbackPropertyIds;
  body: Record<string, unknown>;
}): Promise<{
  results: Array<Record<string, unknown>>;
  nextCursor?: string;
  hasMore: boolean;
}> {
  const query = new URLSearchParams();
  for (const propertyId of publicProjectionPropertyIds(propertyIds)) {
    query.append("filter_properties", propertyId);
  }
  const response = await request(
    `${NOTION_API_URL}/data_sources/${dataSourceId}/query?${query.toString()}`,
    { method: "POST", headers, body: JSON.stringify(body) },
  );
  const value = await readNotionPage(response);
  const results = value.results;
  if (!Array.isArray(results)) {
    throw new Error("Notion returned an invalid Post list.");
  }
  return {
    results: results.map((result) => {
      if (!result || typeof result !== "object" || Array.isArray(result)) {
        throw new Error("Notion returned an invalid Post list.");
      }
      return result as Record<string, unknown>;
    }),
    ...(typeof value.next_cursor === "string"
      ? { nextCursor: value.next_cursor }
      : {}),
    hasMore: value.has_more === true,
  };
}

function publicProjectionPropertyIds(ids: FeedbackPropertyIds): string[] {
  return [
    ids.title,
    ids.slug,
    ids.description,
    ids.type,
    ids.status,
    ids.createdAt,
    ids.updatedAt,
  ];
}

function postFromPublicPage(
  page: Record<string, unknown>,
  ids: FeedbackPropertyIds,
  published?: boolean,
): StoredPost {
  const properties = recordField(page, "properties");
  const property = (propertyId: string) => propertyById(properties, propertyId);
  return {
    id: stringField(page, "id"),
    slug: requiredText(property(ids.slug), "rich_text", "Slug"),
    title: requiredText(property(ids.title), "title", "Title"),
    description: requiredText(
      property(ids.description),
      "rich_text",
      "Description",
    ),
    type: postTypeFromNotion(requiredSelect(property(ids.type), "Type")),
    status: postStatusFromNotion(
      requiredSelect(property(ids.status), "Status"),
    ),
    published: published ?? booleanField(property(ids.published), "checkbox"),
    createdAt: new Date(stringField(page, "created_time")),
    updatedAt: new Date(stringField(page, "last_edited_time")),
  };
}

function propertiesForDraftEdit(
  item: StoredPost,
  ids: FeedbackPropertyIds,
): Record<string, unknown> {
  return {
    [ids.title]: richTitle(item.title),
    [ids.description]: richText(item.description),
    [ids.type]: { select: { name: item.type } },
  };
}

function propertiesForCreate(
  item: NewStoredPost,
  ids: FeedbackPropertyIds,
): Record<string, unknown> {
  return {
    [ids.title]: richTitle(item.title),
    [ids.slug]: richText(item.slug),
    [ids.description]: richText(item.description),
    [ids.type]: { select: { name: item.type } },
    [ids.status]: { select: { name: item.status } },
    [ids.published]: { checkbox: item.published },
    [ids.submitterName]: richText(item.submitter?.name),
    [ids.submitterEmail]: { email: item.submitter?.email ?? null },
    [ids.source]: { select: { name: item.source ?? "Portal" } },
    [ids.externalId]: richText(
      typeof item.externalId === "string" ? item.externalId : undefined,
    ),
    [ids.editTokenHash]: richText(item.browserCapabilityHash),
  };
}

function richTitle(content: string): Record<string, unknown> {
  return { title: [{ type: "text", text: { content } }] };
}

function richText(content?: string): Record<string, unknown> {
  return {
    rich_text: content ? [{ type: "text", text: { content } }] : [],
  };
}

async function readNotionPage(
  response: Response,
): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  if (!response.ok) {
    throw new Error(`Notion rejected the Post request (${response.status}).`);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Notion returned an invalid Post response.");
  }
  return body as Record<string, unknown>;
}

function postFromPage(
  page: Record<string, unknown>,
  ids: FeedbackPropertyIds,
): StoredPost {
  const publicItem = postFromPublicPage(page, ids);
  const properties = recordField(page, "properties");
  const property = (propertyId: string) => propertyById(properties, propertyId);
  const name = optionalText(property(ids.submitterName), "rich_text");
  const email = optionalString(property(ids.submitterEmail), "email");

  return {
    ...publicItem,
    ...(name || email
      ? {
          submitter: { ...(name ? { name } : {}), ...(email ? { email } : {}) },
        }
      : {}),
    browserCapabilityHash: optionalText(
      property(ids.editTokenHash),
      "rich_text",
    ),
  } satisfies StoredPost;
}

function firstQueryResult(
  response: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const results = response.results;
  if (!Array.isArray(results)) {
    throw new Error("Notion returned an invalid Post list.");
  }
  const first = results[0];
  if (first === undefined) return undefined;
  if (!first || typeof first !== "object" || Array.isArray(first)) {
    throw new Error("Notion returned an invalid Post list.");
  }
  return first as Record<string, unknown>;
}

function postTypeFromNotion(value: string): PostType {
  if (
    value === "Feature Request" ||
    value === "Bug Report" ||
    value === "General Feedback"
  ) {
    return value;
  }
  throw new Error(`Notion returned unsupported Feedback Type "${value}".`);
}

function postStatusFromNotion(value: string): PostStatus {
  if (
    value === "New" ||
    value === "Reviewing" ||
    value === "Planned" ||
    value === "In Progress" ||
    value === "Shipped" ||
    value === "Closed"
  ) {
    return value;
  }
  throw new Error(`Notion returned unsupported Feedback Status "${value}".`);
}

function propertyById(
  properties: Record<string, unknown>,
  id: string,
): Record<string, unknown> {
  const property = optionalPropertyById(properties, id);
  if (property) return property;
  throw new Error(`Notion omitted configured Feedback property ID "${id}".`);
}

function optionalPropertyById(
  properties: Record<string, unknown>,
  id: string,
): Record<string, unknown> | undefined {
  for (const value of Object.values(properties)) {
    if (value && typeof value === "object" && Reflect.get(value, "id") === id) {
      return value as Record<string, unknown>;
    }
  }
  return undefined;
}

function requiredText(
  property: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const value = optionalText(property, key);
  if (!value) throw new Error(`Notion returned an empty ${label} property.`);
  return value;
}

function optionalText(
  property: Record<string, unknown>,
  key: string,
): string | undefined {
  const values = property[key];
  if (!Array.isArray(values)) return undefined;
  const text = values
    .map((value) =>
      value && typeof value === "object"
        ? Reflect.get(value, "plain_text")
        : undefined,
    )
    .filter((value): value is string => typeof value === "string")
    .join("");
  return text || undefined;
}

function requiredSelect(
  property: Record<string, unknown>,
  label: string,
): string {
  const select = property.select;
  const name =
    select && typeof select === "object"
      ? Reflect.get(select, "name")
      : undefined;
  if (typeof name !== "string")
    throw new Error(`Notion returned an invalid ${label} property.`);
  return name;
}

function booleanField(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  if (typeof value !== "boolean")
    throw new Error(`Notion returned an invalid ${key} value.`);
  return value;
}

function optionalString(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string")
    throw new Error(`Notion returned an invalid ${key} value.`);
  return value;
}

function recordField(
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const value = record[key];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Notion returned an invalid ${key} value.`);
  }
  return value as Record<string, unknown>;
}
