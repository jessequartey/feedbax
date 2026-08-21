import { requestNotion, type NotionRetryOptions } from "./notion-request";

const NOTION_API_URL = "https://api.notion.com/v1";
const NOTION_API_VERSION = "2026-03-11";

const canonicalProperties = {
  title: { name: "Title", type: "title", schema: { title: {} } },
  slug: { name: "Slug", type: "rich_text", schema: { rich_text: {} } },
  description: {
    name: "Description",
    type: "rich_text",
    schema: { rich_text: {} },
  },
  type: {
    name: "Type",
    type: "select",
    schema: {
      select: {
        options: [
          { name: "Feature Request" },
          { name: "Bug Report" },
          { name: "General Feedback" },
        ],
      },
    },
  },
  status: {
    name: "Status",
    type: "select",
    schema: {
      select: {
        options: [
          { name: "New" },
          { name: "Reviewing" },
          { name: "Planned" },
          { name: "In Progress" },
          { name: "Shipped" },
          { name: "Closed" },
        ],
      },
    },
  },
  published: {
    name: "Published",
    type: "checkbox",
    schema: { checkbox: {} },
  },
  submitterName: {
    name: "Submitter Name",
    type: "rich_text",
    schema: { rich_text: {} },
  },
  submitterEmail: {
    name: "Submitter Email",
    type: "email",
    schema: { email: {} },
  },
  source: {
    name: "Source",
    type: "select",
    schema: {
      select: {
        options: [{ name: "Portal" }, { name: "API" }, { name: "Team" }],
      },
    },
  },
  externalId: {
    name: "External ID",
    type: "rich_text",
    schema: { rich_text: {} },
  },
  editTokenHash: {
    name: "Edit Token Hash",
    type: "rich_text",
    schema: { rich_text: {} },
  },
  createdAt: {
    name: "Created At",
    type: "created_time",
    schema: { created_time: {} },
  },
  updatedAt: {
    name: "Updated At",
    type: "last_edited_time",
    schema: { last_edited_time: {} },
  },
} as const;

export type FeedbackPropertyIds = {
  [Key in keyof typeof canonicalProperties]: string;
};

export interface FeedbackDataSourceConfiguration {
  databaseId: string;
  dataSourceId: string;
  propertyIds: FeedbackPropertyIds;
}

interface CreateNotionFeedbackDataSourceOptions {
  token: string;
  parentPageId: string;
  request?: typeof fetch;
  retry?: NotionRetryOptions;
}

interface ValidateNotionFeedbackDataSourceOptions {
  token: string;
  dataSourceId: string;
  propertyIds: FeedbackPropertyIds;
  request?: typeof fetch;
  retry?: NotionRetryOptions;
}

interface NotionProperty {
  id?: unknown;
  name?: unknown;
  type?: unknown;
}

interface NotionObjectResponse {
  id?: unknown;
  parent?: unknown;
  properties?: unknown;
}

export async function createNotionFeedbackDataSource({
  token,
  parentPageId,
  request = fetch,
  retry,
}: CreateNotionFeedbackDataSourceOptions): Promise<FeedbackDataSourceConfiguration> {
  const response = await requestNotion(
    `${NOTION_API_URL}/databases`,
    {
      method: "POST",
      headers: notionHeaders(token),
      body: JSON.stringify({
        parent: { type: "page_id", page_id: parentPageId },
        title: [{ type: "text", text: { content: "Feedback" } }],
        initial_data_source: {
          properties: Object.fromEntries(
            Object.values(canonicalProperties).map(({ name, schema }) => [
              name,
              schema,
            ]),
          ),
        },
      }),
    },
    { request, retry, operation: "create" },
  );

  const database = await readNotionResponse(response);
  if (typeof database.id !== "string") {
    throw new Error("Notion did not return the created Feedback database.");
  }
  const dataSourceId = firstDataSourceId(database);
  const dataSourceResponse = await requestNotion(
    `${NOTION_API_URL}/data_sources/${dataSourceId}`,
    { method: "GET", headers: notionHeaders(token) },
    { request, retry, operation: "idempotent" },
  );
  const dataSource = await readNotionResponse(dataSourceResponse);
  return configurationFromCanonicalNames(dataSource, database.id);
}

export async function validateNotionFeedbackDataSource({
  token,
  dataSourceId,
  propertyIds,
  request = fetch,
  retry,
}: ValidateNotionFeedbackDataSourceOptions): Promise<FeedbackDataSourceConfiguration> {
  const response = await requestNotion(
    `${NOTION_API_URL}/data_sources/${dataSourceId}`,
    {
      method: "GET",
      headers: notionHeaders(token),
    },
    { request, retry, operation: "idempotent" },
  );
  const dataSource = await readNotionResponse(response);
  const properties = dataSource.properties;

  if (typeof dataSource.id !== "string" || !isPropertyMap(properties)) {
    throw new Error(
      "Notion returned an invalid Feedback Data Source response.",
    );
  }

  const propertiesById = new Map(
    Object.values(properties)
      .filter(
        (property): property is NotionProperty & { id: string } =>
          Boolean(property) && typeof property.id === "string",
      )
      .map((property) => [property.id, property]),
  );
  const repairs: string[] = [];

  for (const [key, { name, type }] of Object.entries(canonicalProperties)) {
    const configuredId = propertyIds[key as keyof FeedbackPropertyIds];
    const property = propertiesById.get(configuredId);

    if (!property) {
      repairs.push(
        `Restore the "${name}" property with ID "${configuredId}" and type "${type}", then update the configured property ID if Notion assigns a new one.`,
      );
    } else if (property.type !== type) {
      repairs.push(
        `Change the property configured as "${name}" (ID "${configuredId}") from "${String(property.type)}" to "${type}", or restore a ${type} property and configure its ID.`,
      );
    }
  }

  if (repairs.length > 0) {
    throw new Error(repairs.join("\n"));
  }

  return {
    databaseId: databaseIdFromDataSource(dataSource),
    dataSourceId,
    propertyIds: { ...propertyIds },
  };
}

function notionHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Notion-Version": NOTION_API_VERSION,
  };
}

async function readNotionResponse(
  response: Response,
): Promise<NotionObjectResponse> {
  const body: unknown = await response.json();

  if (!response.ok) {
    throw new Error(
      `Notion rejected the Feedback Data Source request (${response.status}).`,
    );
  }

  if (!body || typeof body !== "object") {
    throw new Error(
      "Notion returned an invalid Feedback Data Source response.",
    );
  }

  return body;
}

function firstDataSourceId(database: NotionObjectResponse): string {
  const dataSources = Reflect.get(database, "data_sources");
  const firstDataSource = Array.isArray(dataSources)
    ? dataSources[0]
    : undefined;
  const id =
    firstDataSource && typeof firstDataSource === "object"
      ? Reflect.get(firstDataSource, "id")
      : undefined;

  if (typeof id !== "string") {
    throw new Error("Notion did not return the created Feedback Data Source.");
  }

  return id;
}

function configurationFromCanonicalNames(
  dataSource: NotionObjectResponse,
  databaseId: string,
): FeedbackDataSourceConfiguration {
  const properties = dataSource.properties;
  if (typeof dataSource.id !== "string" || !isPropertyMap(properties)) {
    throw new Error(
      "Notion returned an invalid Feedback Data Source response.",
    );
  }

  return {
    databaseId,
    dataSourceId: dataSource.id,
    propertyIds: Object.fromEntries(
      Object.entries(canonicalProperties).map(([key, { name }]) => {
        const property = properties[name];
        if (!property || typeof property.id !== "string") {
          throw new Error(
            `Notion did not return the required ${name} property.`,
          );
        }
        return [key, property.id];
      }),
    ) as FeedbackPropertyIds,
  };
}

function databaseIdFromDataSource(dataSource: NotionObjectResponse): string {
  const parent = dataSource.parent;
  const databaseId =
    parent && typeof parent === "object"
      ? Reflect.get(parent, "database_id")
      : undefined;

  if (typeof databaseId !== "string") {
    throw new Error(
      "Notion did not return the Feedback Data Source parent database.",
    );
  }

  return databaseId;
}

function isPropertyMap(
  value: unknown,
): value is Record<string, NotionProperty> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
