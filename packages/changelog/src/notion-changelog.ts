import type {
  ChangelogDate,
  ChangelogImage,
  ChangelogStorage,
  PublicChangelogEntry,
} from "./index";

const NOTION_API_URL = "https://api.notion.com/v1";
const NOTION_API_VERSION = "2026-03-11";

const canonicalProperties = {
  title: { name: "Title", type: "title", schema: { title: {} } },
  slug: { name: "Slug", type: "rich_text", schema: { rich_text: {} } },
  date: { name: "Date", type: "date", schema: { date: {} } },
  summary: {
    name: "Summary",
    type: "rich_text",
    schema: { rich_text: {} },
  },
  body: { name: "Body", type: "rich_text", schema: { rich_text: {} } },
  labels: {
    name: "Labels",
    type: "multi_select",
    schema: { multi_select: { options: [] } },
  },
  image: { name: "Image", type: "files", schema: { files: {} } },
  published: {
    name: "Published",
    type: "checkbox",
    schema: { checkbox: {} },
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

export type ChangelogPropertyIds = {
  [Key in keyof typeof canonicalProperties]: string;
};

export interface ChangelogDataSourceConfiguration {
  databaseId: string;
  dataSourceId: string;
  propertyIds: ChangelogPropertyIds;
}

interface NotionOptions {
  token: string;
  request?: typeof fetch;
}

export interface NotionChangelogStorageOptions extends NotionOptions {
  dataSourceId: string;
  propertyIds: ChangelogPropertyIds;
  onDiagnostic?: (message: string) => void;
}

export async function createNotionChangelogDataSource({
  token,
  databaseId,
  request = fetch,
}: NotionOptions & {
  databaseId: string;
}): Promise<ChangelogDataSourceConfiguration> {
  const response = await request(`${NOTION_API_URL}/data_sources`, {
    method: "POST",
    headers: notionHeaders(token),
    body: JSON.stringify({
      parent: { database_id: databaseId },
      title: [{ type: "text", text: { content: "Changelog" } }],
      properties: Object.fromEntries(
        Object.values(canonicalProperties).map(({ name, schema }) => [
          name,
          schema,
        ]),
      ),
    }),
  });
  return configurationFromResponse(
    await readObject(response, "Changelog Data Source"),
    databaseId,
  );
}

export async function validateNotionChangelogDataSource({
  token,
  dataSourceId,
  propertyIds,
  request = fetch,
}: NotionChangelogStorageOptions): Promise<ChangelogDataSourceConfiguration> {
  const response = await request(
    `${NOTION_API_URL}/data_sources/${dataSourceId}`,
    { headers: notionHeaders(token) },
  );
  const dataSource = await readObject(response, "Changelog Data Source");
  const properties = recordAt(dataSource, "properties");
  const propertiesById = new Map(
    Object.values(properties).flatMap((property) => {
      if (!isRecord(property) || typeof property.id !== "string") return [];
      return [[property.id, property] as const];
    }),
  );
  const repairs: string[] = [];
  for (const [key, { name, type }] of Object.entries(canonicalProperties)) {
    const configuredId = propertyIds[key as keyof ChangelogPropertyIds];
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
  if (repairs.length) throw new Error(repairs.join("\n"));
  return {
    databaseId: databaseIdFromResponse(dataSource),
    dataSourceId,
    propertyIds: { ...propertyIds },
  };
}

export function createNotionChangelogStorage({
  token,
  dataSourceId,
  propertyIds,
  request = fetch,
  onDiagnostic = console.warn,
}: NotionChangelogStorageOptions): ChangelogStorage {
  return {
    async listPublished(query) {
      const url = new URL(
        `${NOTION_API_URL}/data_sources/${dataSourceId}/query`,
      );
      for (const id of publicPropertyIds(propertyIds)) {
        url.searchParams.append("filter_properties", id);
      }
      const response = await request(url, {
        method: "POST",
        headers: notionHeaders(token),
        body: JSON.stringify({
          page_size: 20,
          ...(query.cursor ? { start_cursor: query.cursor } : {}),
          filter: {
            and: [
              {
                property: propertyIds.published,
                checkbox: { equals: true },
              },
              ...(query.label
                ? [
                    {
                      property: propertyIds.labels,
                      multi_select: { contains: query.label },
                    },
                  ]
                : []),
            ],
          },
          sorts: [
            { property: propertyIds.date, direction: "descending" },
            { timestamp: "created_time", direction: "ascending" },
            { property: propertyIds.slug, direction: "ascending" },
          ],
        }),
      });
      const body = await readObject(response, "Changelog query");
      if (!Array.isArray(body.results)) {
        throw new Error("Notion returned an invalid Changelog Entry list.");
      }
      const items = body.results.map((page) =>
        entryFromPage(record(page), propertyIds, { onDiagnostic }),
      );
      const nextCursor =
        body.has_more === true && typeof body.next_cursor === "string"
          ? body.next_cursor
          : undefined;
      return { items, ...(nextCursor ? { nextCursor } : {}) };
    },
  };
}

function publicPropertyIds(ids: ChangelogPropertyIds): string[] {
  return [
    ids.title,
    ids.slug,
    ids.date,
    ids.summary,
    ids.body,
    ids.labels,
    ids.image,
    ids.updatedAt,
  ];
}

function entryFromPage(
  page: Record<string, unknown>,
  ids: ChangelogPropertyIds,
  projection: {
    onDiagnostic: (message: string) => void;
  },
): PublicChangelogEntry {
  const properties = recordAt(page, "properties");
  const slug = richText(propertyAt(properties, ids.slug));
  const title = titleText(propertyAt(properties, ids.title));
  const image = firstImage(propertyAt(properties, ids.image), {
    ...projection,
    slug,
    alt: `${title} image`,
  });
  return {
    slug,
    date: dateValue(propertyAt(properties, ids.date)),
    title,
    summary: richText(propertyAt(properties, ids.summary)),
    body: richText(propertyAt(properties, ids.body)),
    labels: multiSelect(propertyAt(properties, ids.labels)),
    updatedAt: new Date(requiredString(page.last_edited_time)),
    ...(image ? { image } : {}),
  };
}

function configurationFromResponse(
  dataSource: Record<string, unknown>,
  databaseId: string,
): ChangelogDataSourceConfiguration {
  const properties = recordAt(dataSource, "properties");
  return {
    databaseId,
    dataSourceId: requiredString(dataSource.id),
    propertyIds: Object.fromEntries(
      Object.entries(canonicalProperties).map(([key, { name }]) => [
        key,
        requiredString(recordAt(properties, name).id),
      ]),
    ) as ChangelogPropertyIds,
  };
}

function databaseIdFromResponse(dataSource: Record<string, unknown>): string {
  return requiredString(recordAt(dataSource, "parent").database_id);
}

function titleText(property: Record<string, unknown>): string {
  return plainText(property.title);
}

function richText(property: Record<string, unknown>): string {
  return plainText(property.rich_text);
}

function plainText(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((item) =>
      isRecord(item) && typeof item.plain_text === "string"
        ? item.plain_text
        : "",
    )
    .join("");
}

function dateValue(property: Record<string, unknown>): ChangelogDate {
  const value = recordAt(property, "date").start;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    throw new Error("Notion returned a Changelog Entry without a valid Date.");
  }
  return value as ChangelogDate;
}

function multiSelect(property: Record<string, unknown>): string[] {
  if (!Array.isArray(property.multi_select)) return [];
  return property.multi_select.flatMap((option) =>
    isRecord(option) && typeof option.name === "string" ? [option.name] : [],
  );
}

function firstImage(
  property: Record<string, unknown>,
  {
    slug,
    alt,
    onDiagnostic,
  }: {
    slug: string;
    alt: string;
    onDiagnostic: (message: string) => void;
  },
): ChangelogImage | undefined {
  if (!Array.isArray(property.files) || property.files.length === 0) return;
  if (property.files.length > 1) {
    onDiagnostic(
      `Changelog Entry "${slug}" has ${property.files.length} Image files; only the first file is in the public contract.`,
    );
  }
  if (!isRecord(property.files[0])) {
    onDiagnostic(`Changelog Entry "${slug}" has an invalid Image reference.`);
    return;
  }
  const file = property.files[0];
  const hosted = isRecord(file.file) ? file.file : undefined;
  const external = isRecord(file.external) ? file.external : undefined;
  const src = hosted?.url ?? external?.url;
  if (typeof src !== "string" || !isHttpUrl(src)) {
    onDiagnostic(`Changelog Entry "${slug}" has an invalid Image reference.`);
    return;
  }
  const expiresAt =
    hosted && typeof hosted.expiry_time === "string"
      ? new Date(hosted.expiry_time)
      : undefined;
  if (hosted && (!expiresAt || Number.isNaN(expiresAt.getTime()))) {
    onDiagnostic(
      `Changelog Entry "${slug}" has a temporary Image reference without a valid expiry.`,
    );
    return;
  }
  return {
    src,
    alt,
    ...(expiresAt ? { expiresAt } : {}),
  };
}

function isHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

function propertyAt(
  properties: Record<string, unknown>,
  id: string,
): Record<string, unknown> {
  return recordAt(properties, id);
}

function notionHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Notion-Version": NOTION_API_VERSION,
  };
}

async function readObject(
  response: Response,
  subject: string,
): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      `Notion rejected the ${subject} request (${response.status}).`,
    );
  }
  if (!isRecord(body))
    throw new Error(`Notion returned an invalid ${subject} response.`);
  return body;
}

function recordAt(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  return record(value[key]);
}

function record(value: unknown): Record<string, unknown> {
  if (!isRecord(value))
    throw new Error("Notion returned an invalid Changelog response.");
  return value;
}

function requiredString(value: unknown): string {
  if (typeof value !== "string")
    throw new Error("Notion returned an invalid Changelog response.");
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
