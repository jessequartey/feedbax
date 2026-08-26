import { describe, expect, it, vi } from "vitest";

import {
  createChangelogModule,
  createNotionChangelogDataSource,
  createNotionChangelogStorage,
  validateNotionChangelogDataSource,
  type ChangelogPropertyIds,
} from ".";

const propertyIds: ChangelogPropertyIds = {
  title: "title-id",
  slug: "slug-id",
  date: "date-id",
  summary: "summary-id",
  body: "body-id",
  labels: "labels-id",
  image: "image-id",
  published: "published-id",
  createdAt: "created-id",
  updatedAt: "updated-id",
};

describe("Notion Changelog Data Source contract", () => {
  it("creates an empty sibling data source with the canonical schema", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(notionDataSource()));

    await expect(
      createNotionChangelogDataSource({
        token: "token",
        databaseId: "feedbax-database",
        request,
      }),
    ).resolves.toEqual({
      databaseId: "feedbax-database",
      dataSourceId: "changelog-source",
      propertyIds,
    });
    const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body));
    expect(request.mock.calls[0]?.[0]).toBe(
      "https://api.notion.com/v1/data_sources",
    );
    expect(body.parent).toEqual({ database_id: "feedbax-database" });
    expect(body.properties).toMatchObject({
      Title: { title: {} },
      Slug: { rich_text: {} },
      Date: { date: {} },
      Summary: { rich_text: {} },
      Body: { rich_text: {} },
      Labels: { multi_select: { options: [] } },
      Image: { files: {} },
      Published: { checkbox: {} },
      "Created At": { created_time: {} },
      "Updated At": { last_edited_time: {} },
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("accepts a compatible data source in another database and reports wrong types", async () => {
    const validRequest = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(notionDataSource({ databaseId: "marketing-database" })),
      );
    await expect(
      validateNotionChangelogDataSource({
        token: "token",
        dataSourceId: "changelog-source",
        propertyIds,
        request: validRequest,
      }),
    ).resolves.toMatchObject({ databaseId: "marketing-database" });

    const invalid = notionDataSource();
    invalid.properties.Summary.type = "number";
    await expect(
      validateNotionChangelogDataSource({
        token: "token",
        dataSourceId: "changelog-source",
        propertyIds,
        request: vi
          .fn<typeof fetch>()
          .mockResolvedValue(Response.json(invalid)),
      }),
    ).rejects.toThrow(
      'Change the property configured as "Summary" (ID "summary-id") from "number" to "rich_text"',
    );
  });
});

describe("Notion Changelog query contract", () => {
  it("queries only Published entries with public properties, ordering, Labels, and cursors", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({
        results: [notionPage()],
        has_more: true,
        next_cursor: "notion-next",
      }),
    );
    const storage = createNotionChangelogStorage({
      token: "token",
      dataSourceId: "changelog-source",
      propertyIds,
      request,
    });

    await expect(
      storage.listPublished({ cursor: "notion-current", label: "Improved" }),
    ).resolves.toMatchObject({
      items: [
        {
          slug: "entry",
          title: "Entry",
          summary: "Summary text",
          body: "Body text",
          labels: ["Improved"],
        },
      ],
      nextCursor: "notion-next",
    });
    const [url, init] = request.mock.calls[0] ?? [];
    const query = new URL(String(url)).searchParams.getAll("filter_properties");
    expect(query).toEqual([
      propertyIds.title,
      propertyIds.slug,
      propertyIds.date,
      propertyIds.summary,
      propertyIds.body,
      propertyIds.labels,
      propertyIds.image,
      propertyIds.updatedAt,
    ]);
    expect(query).not.toContain(propertyIds.published);
    expect(JSON.parse(String(init?.body))).toEqual({
      page_size: 20,
      start_cursor: "notion-current",
      filter: {
        and: [
          { property: propertyIds.published, checkbox: { equals: true } },
          {
            property: propertyIds.labels,
            multi_select: { contains: "Improved" },
          },
        ],
      },
      sorts: [
        { property: propertyIds.date, direction: "descending" },
        { timestamp: "created_time", direction: "ascending" },
        { property: propertyIds.slug, direction: "ascending" },
      ],
    });
  });

  it("maps one temporary File reference with its expiry and reports additional files", async () => {
    const page = notionPage();
    page.properties[propertyIds.image] = {
      type: "files",
      files: [
        {
          name: "release.png",
          type: "file",
          file: {
            url: "https://files.notion.example/release.png",
            expiry_time: "2026-08-26T14:00:00.000Z",
          },
        },
        {
          name: "extra.png",
          type: "external",
          external: { url: "https://cdn.example/extra.png" },
        },
      ],
    };
    const diagnostics: string[] = [];
    const storage = createNotionChangelogStorage({
      token: "token",
      dataSourceId: "changelog-source",
      propertyIds,
      request: vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          Response.json({ results: [page], has_more: false }),
        ),
      onDiagnostic: (message) => diagnostics.push(message),
    });

    await expect(storage.listPublished({})).resolves.toMatchObject({
      items: [
        {
          title: "Entry",
          image: {
            src: "https://files.notion.example/release.png",
            alt: "Entry image",
            expiresAt: new Date("2026-08-26T14:00:00.000Z"),
          },
        },
      ],
    });
    expect(diagnostics).toEqual([
      'Changelog Entry "entry" has 2 Image files; only the first file is in the public contract.',
    ]);
  });

  it("maps a temporary File reference's exact expiry while preserving entry text", async () => {
    const page = notionPage();
    page.properties[propertyIds.image] = {
      type: "files",
      files: [
        {
          name: "release.png",
          type: "file",
          file: {
            url: "https://files.notion.example/release.png",
            expiry_time: "2026-08-26T12:00:30.000Z",
          },
        },
      ],
    };
    const storage = createNotionChangelogStorage({
      token: "token",
      dataSourceId: "changelog-source",
      propertyIds,
      request: vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(
          Response.json({ results: [page], has_more: false }),
        ),
    });

    await expect(storage.listPublished({})).resolves.toMatchObject({
      items: [
        {
          title: "Entry",
          summary: "Summary text",
          body: "Body text",
          image: { expiresAt: new Date("2026-08-26T12:00:30.000Z") },
        },
      ],
    });
  });

  it("refreshes a discarded temporary reference and contains malformed Image data", async () => {
    const expiringPage = notionPage();
    expiringPage.properties[propertyIds.image] = {
      type: "files",
      files: [
        {
          type: "file",
          file: {
            url: "https://files.notion.example/release.png",
            expiry_time: "2026-08-26T12:00:30.000Z",
          },
        },
      ],
    };
    const refreshedPage = notionPage();
    refreshedPage.properties[propertyIds.image] = {
      type: "files",
      files: [
        {
          type: "file",
          file: {
            url: "https://files.notion.example/release.png",
            expiry_time: "2026-08-26T14:00:00.000Z",
          },
        },
      ],
    };
    const malformedPage = notionPage();
    malformedPage.properties[propertyIds.image] = {
      type: "files",
      files: ["not-a-file"],
    };
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ results: [expiringPage], has_more: false }),
      )
      .mockResolvedValueOnce(
        Response.json({ results: [refreshedPage], has_more: false }),
      )
      .mockResolvedValueOnce(
        Response.json({ results: [malformedPage], has_more: false }),
      );
    const storage = createNotionChangelogStorage({
      token: "token",
      dataSourceId: "changelog-source",
      propertyIds,
      request,
      onDiagnostic: vi.fn(),
    });
    const changelog = createChangelogModule({
      storage,
      now: () => new Date("2026-08-26T12:00:00.000Z"),
    });

    expect(
      (await changelog.listPublishedEntries()).items[0],
    ).not.toHaveProperty("image");
    expect((await changelog.listPublishedEntries()).items[0]).toHaveProperty(
      "image.src",
      "https://files.notion.example/release.png",
    );
    await expect(changelog.listPublishedEntries()).resolves.toMatchObject({
      items: [{ title: "Entry", summary: "Summary text", body: "Body text" }],
    });
  });
});

function notionDataSource({ databaseId = "feedbax-database" } = {}) {
  const properties = Object.fromEntries(
    [
      ["Title", propertyIds.title, "title"],
      ["Slug", propertyIds.slug, "rich_text"],
      ["Date", propertyIds.date, "date"],
      ["Summary", propertyIds.summary, "rich_text"],
      ["Body", propertyIds.body, "rich_text"],
      ["Labels", propertyIds.labels, "multi_select"],
      ["Image", propertyIds.image, "files"],
      ["Published", propertyIds.published, "checkbox"],
      ["Created At", propertyIds.createdAt, "created_time"],
      ["Updated At", propertyIds.updatedAt, "last_edited_time"],
    ].map(([name, id, type]) => [name, { id, name, type }]),
  );
  return {
    id: "changelog-source",
    parent: { type: "database_id", database_id: databaseId },
    properties,
  };
}

function notionPage() {
  return {
    id: "page-id",
    created_time: "2026-08-01T00:00:00.000Z",
    last_edited_time: "2026-08-02T00:00:00.000Z",
    properties: {
      [propertyIds.title]: { type: "title", title: [text("Entry")] },
      [propertyIds.slug]: { type: "rich_text", rich_text: [text("entry")] },
      [propertyIds.date]: { type: "date", date: { start: "2026-08-01" } },
      [propertyIds.summary]: {
        type: "rich_text",
        rich_text: [text("Summary "), text("text")],
      },
      [propertyIds.body]: { type: "rich_text", rich_text: [text("Body text")] },
      [propertyIds.labels]: {
        type: "multi_select",
        multi_select: [{ name: "Improved" }],
      },
      [propertyIds.image]: { type: "files", files: [] as unknown[] },
    },
  };
}

function text(content: string) {
  return { type: "text", plain_text: content, text: { content } };
}
