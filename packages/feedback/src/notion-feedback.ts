import type { FeedbackStatus, FeedbackType } from "./index";
import type {
  FeedbackStorage,
  NewStoredFeedbackItem,
  StoredFeedbackItem,
} from "./feedback-storage";
import type { FeedbackPropertyIds } from "./notion-data-source";

const NOTION_API_URL = "https://api.notion.com/v1";
const NOTION_API_VERSION = "2026-03-11";

export interface NotionFeedbackStorageOptions {
  token: string;
  dataSourceId: string;
  propertyIds: FeedbackPropertyIds;
  request?: typeof fetch;
}

export function createNotionFeedbackStorage({
  token,
  dataSourceId,
  propertyIds,
  request = fetch,
}: NotionFeedbackStorageOptions): FeedbackStorage {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Notion-Version": NOTION_API_VERSION,
  };

  return {
    async create(item) {
      const response = await request(`${NOTION_API_URL}/pages`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          parent: { type: "data_source_id", data_source_id: dataSourceId },
          properties: propertiesForCreate(item, propertyIds),
        }),
      });
      return feedbackItemFromPage(await readNotionPage(response), propertyIds);
    },
    async save(item) {
      const response = await request(`${NOTION_API_URL}/pages/${item.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          properties: propertiesForDraftEdit(item, propertyIds),
        }),
      });
      return feedbackItemFromPage(await readNotionPage(response), propertyIds);
    },
    async find(id) {
      const response = await request(`${NOTION_API_URL}/pages/${id}`, {
        method: "GET",
        headers,
      });
      if (response.status === 404) return undefined;
      return feedbackItemFromPage(await readNotionPage(response), propertyIds);
    },
    async list() {
      throw new Error("Notion public retrieval is not implemented yet.");
    },
    async remove(id) {
      const response = await request(`${NOTION_API_URL}/pages/${id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ in_trash: true }),
      });
      await readNotionPage(response);
    },
  };
}

function propertiesForDraftEdit(
  item: StoredFeedbackItem,
  ids: FeedbackPropertyIds,
): Record<string, unknown> {
  return {
    [ids.title]: richTitle(item.title),
    [ids.description]: richText(item.description),
    [ids.type]: { select: { name: item.type } },
    [ids.submitterName]: richText(item.submitter?.name),
    [ids.submitterEmail]: { email: item.submitter?.email ?? null },
  };
}

function propertiesForCreate(
  item: NewStoredFeedbackItem,
  ids: FeedbackPropertyIds,
): Record<string, unknown> {
  return {
    [ids.title]: richTitle(item.title),
    [ids.description]: richText(item.description),
    [ids.type]: { select: { name: item.type } },
    [ids.status]: { select: { name: item.status } },
    [ids.published]: { checkbox: item.published },
    [ids.submitterName]: richText(item.submitter?.name),
    [ids.submitterEmail]: { email: item.submitter?.email ?? null },
    [ids.source]: { select: { name: "Portal" } },
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
    throw new Error(
      `Notion rejected the Feedback Item request (${response.status}).`,
    );
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Notion returned an invalid Feedback Item response.");
  }
  return body as Record<string, unknown>;
}

function feedbackItemFromPage(
  page: Record<string, unknown>,
  ids: FeedbackPropertyIds,
): StoredFeedbackItem {
  const id = stringField(page, "id");
  const properties = recordField(page, "properties");
  const property = (propertyId: string) => propertyById(properties, propertyId);
  const name = optionalText(property(ids.submitterName), "rich_text");
  const email = optionalString(property(ids.submitterEmail), "email");

  return {
    id,
    title: requiredText(property(ids.title), "title", "Title"),
    description: requiredText(
      property(ids.description),
      "rich_text",
      "Description",
    ),
    type: feedbackTypeFromNotion(requiredSelect(property(ids.type), "Type")),
    status: feedbackStatusFromNotion(
      requiredSelect(property(ids.status), "Status"),
    ),
    published: booleanField(property(ids.published), "checkbox"),
    ...(name || email
      ? {
          submitter: { ...(name ? { name } : {}), ...(email ? { email } : {}) },
        }
      : {}),
    browserCapabilityHash: optionalText(
      property(ids.editTokenHash),
      "rich_text",
    ),
    createdAt: new Date(stringField(page, "created_time")),
    updatedAt: new Date(stringField(page, "last_edited_time")),
  } satisfies StoredFeedbackItem;
}

function feedbackTypeFromNotion(value: string): FeedbackType {
  if (
    value === "Feature Request" ||
    value === "Bug Report" ||
    value === "General Feedback"
  ) {
    return value;
  }
  throw new Error(`Notion returned unsupported Feedback Type "${value}".`);
}

function feedbackStatusFromNotion(value: string): FeedbackStatus {
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
  for (const value of Object.values(properties)) {
    if (value && typeof value === "object" && Reflect.get(value, "id") === id) {
      return value as Record<string, unknown>;
    }
  }
  throw new Error(`Notion omitted configured Feedback property ID "${id}".`);
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
