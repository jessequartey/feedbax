import { describe, expect, it, vi } from "vitest";

import {
  createNotionFeedbackModule,
  type BrowserCapability,
  type FeedbackPropertyIds,
} from "./index";

const propertyIds: FeedbackPropertyIds = {
  title: "title-id",
  slug: "slug-id",
  description: "description-id",
  type: "type-id",
  status: "status-id",
  published: "published-id",
  submitterName: "submitter-name-id",
  submitterEmail: "submitter-email-id",
  source: "source-id",
  externalId: "external-id",
  editTokenHash: "edit-token-hash-id",
  createdAt: "created-at-id",
  updatedAt: "updated-at-id",
};

describe("Notion-backed Feedback module", () => {
  it("persists a unique Post slug after checking the Notion data source", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          object: "list",
          results: [
            notionPage({
              slug: "keyboard-navigation",
              title: "Existing Post",
              description: "Already claimed this slug.",
              type: "Feature Request",
              editTokenHash: "existing-hash",
            }),
          ],
          has_more: false,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ object: "list", results: [], has_more: false }),
      )
      .mockResolvedValueOnce(
        Response.json(
          notionPage({
            slug: "keyboard-navigation-2",
            title: "Keyboard navigation",
            description: "Navigate without a mouse.",
            type: "Feature Request",
            editTokenHash: "returned-hash",
          }),
        ),
      );
    const feedback = createNotionFeedbackModule({
      token: "notion-token",
      dataSourceId: "feedback-data-source",
      propertyIds,
      request,
    });

    const submitted = await feedback.submitPost({
      title: "Keyboard navigation",
      description: "Navigate without a mouse.",
      type: "Feature Request",
    });

    const firstSlugLookup = JSON.parse(
      String(request.mock.calls[0]?.[1]?.body),
    ) as Record<string, unknown>;
    expect(firstSlugLookup).toEqual({
      page_size: 1,
      filter: {
        property: "slug-id",
        rich_text: { equals: "keyboard-navigation" },
      },
    });
    expect(JSON.parse(String(request.mock.calls[1]?.[1]?.body))).toEqual({
      page_size: 1,
      filter: {
        property: "slug-id",
        rich_text: { equals: "keyboard-navigation-2" },
      },
    });
    const createBody = JSON.parse(String(request.mock.calls[2]?.[1]?.body)) as {
      properties: Record<string, unknown>;
    };
    expect(createBody.properties["slug-id"]).toEqual({
      rich_text: [{ type: "text", text: { content: "keyboard-navigation-2" } }],
    });
    expect(submitted).toMatchObject({
      id: "notion-page-id",
      slug: "keyboard-navigation-2",
    });
  });

  it("keeps the persisted Notion slug unchanged when a Draft Post title is edited", async () => {
    let page = notionPage({
      slug: "original-title",
      title: "Original title",
      description: "Original description",
      type: "General Feedback",
      editTokenHash: "",
    });
    let editProperties: Record<string, unknown> | undefined;
    const request = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.includes("/query") && init?.method === "POST") {
        return Response.json({ object: "list", results: [], has_more: false });
      }
      if (url.endsWith("/pages") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as {
          properties: Record<
            string,
            { rich_text?: Array<{ text: { content: string } }> }
          >;
        };
        page = notionPage({
          slug: "original-title",
          title: "Original title",
          description: "Original description",
          type: "General Feedback",
          editTokenHash:
            body.properties["edit-token-hash-id"]?.rich_text?.[0]?.text
              .content ?? "",
        });
        return Response.json(page);
      }
      if (url.endsWith("/pages/notion-page-id") && init?.method === "GET") {
        return Response.json(page);
      }
      if (url.endsWith("/pages/notion-page-id") && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as {
          properties: Record<string, unknown>;
        };
        editProperties = body.properties;
        page = notionPage({
          slug: "original-title",
          title: "Renamed Post",
          description: "Original description",
          type: "General Feedback",
          editTokenHash: textContent(
            (page.properties as Record<string, unknown>)["Edit Token Hash"],
          ),
        });
        return Response.json(page);
      }
      return Response.json({ message: "unexpected request" }, { status: 500 });
    });
    const feedback = createNotionFeedbackModule({
      token: "notion-token",
      dataSourceId: "feedback-data-source",
      propertyIds,
      request,
    });
    const submitted = await feedback.submitPost({
      title: "Original title",
      description: "Original description",
      type: "General Feedback",
    });

    const edited = await feedback.editDraftPost({
      id: submitted.id,
      browserCapability: submitted.browserCapability,
      title: "Renamed Post",
    });

    expect(editProperties).not.toHaveProperty("slug-id");
    expect(edited).toMatchObject({
      title: "Renamed Post",
      slug: "original-title",
    });
  });

  it("retrieves a published Post by slug through a public-only Notion projection", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        object: "list",
        results: [
          notionPage({
            slug: "keyboard-navigation",
            title: "Keyboard navigation",
            description: "Navigate without a mouse.",
            type: "Feature Request",
            status: "Planned",
            published: true,
            submitterEmail: "private@example.com",
            editTokenHash: "private-hash",
          }),
        ],
        has_more: false,
      }),
    );
    const feedback = createNotionFeedbackModule({
      token: "notion-token",
      dataSourceId: "feedback-data-source",
      propertyIds,
      request,
    });

    const post = await feedback.getPublicPost("keyboard-navigation");

    const [url, init] = request.mock.calls[0]!;
    expect(String(url)).toContain("filter_properties=slug-id");
    expect(String(url)).not.toContain("filter_properties=submitter-email-id");
    expect(JSON.parse(String(init?.body))).toEqual({
      page_size: 1,
      filter: {
        and: [
          { property: "slug-id", rich_text: { equals: "keyboard-navigation" } },
          { property: "published-id", checkbox: { equals: true } },
        ],
      },
    });
    expect(post).toMatchObject({
      slug: "keyboard-navigation",
      title: "Keyboard navigation",
      status: "Planned",
    });
    expect(post).not.toHaveProperty("id");
    expect(post).not.toHaveProperty("submitter");
    expect(post).not.toHaveProperty("browserCapabilityHash");
  });

  it("authorizes draft edits and withdrawal before mutating canonical Notion properties", async () => {
    let page = notionPage({
      title: "Original title",
      description: "Original description",
      type: "General Feedback",
      submitterName: "Ama",
      submitterEmail: "ama@example.com",
      editTokenHash: "",
    });
    const mutations: Array<Record<string, unknown>> = [];
    const request = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.includes("/data_sources/") && init?.method === "POST") {
        return Response.json({ object: "list", results: [], has_more: false });
      }
      if (url.endsWith("/pages") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as {
          properties: Record<
            string,
            { rich_text?: Array<{ text: { content: string } }> }
          >;
        };
        page = notionPage({
          slug: "original-title",
          title: "Original title",
          description: "Original description",
          type: "General Feedback",
          submitterName: "Ama",
          submitterEmail: "ama@example.com",
          editTokenHash:
            body.properties["edit-token-hash-id"]?.rich_text?.[0]?.text
              .content ?? "",
        });
        return Response.json(page);
      }
      if (url.endsWith("/pages/notion-page-id") && init?.method === "GET") {
        return Response.json(page);
      }
      if (url.endsWith("/pages/notion-page-id") && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        mutations.push(body);
        if (body.in_trash === true)
          return Response.json({ ...page, in_trash: true });
        page = notionPage({
          slug: "original-title",
          title: "Corrected title",
          description: "Original description",
          type: "Bug Report",
          submitterName: "Ama",
          submitterEmail: "ama@example.com",
          editTokenHash: textContent(
            (page.properties as Record<string, unknown>)["Edit Token Hash"],
          ),
        });
        return Response.json(page);
      }
      return Response.json({ message: "unexpected request" }, { status: 500 });
    });
    const feedback = createNotionFeedbackModule({
      token: "notion-token",
      dataSourceId: "feedback-data-source",
      propertyIds,
      request,
    });
    const submitted = await feedback.submitPost({
      title: "Original title",
      description: "Original description",
      type: "General Feedback",
      submitter: { name: "Ama", email: "ama@example.com" },
    });

    await expect(
      feedback.editDraftPost({
        id: submitted.id,
        browserCapability:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as BrowserCapability,
        title: "Unauthorized title",
      }),
    ).rejects.toThrow("Browser Capability did not authorize this draft.");
    expect(mutations).toHaveLength(0);

    await expect(
      feedback.editDraftPost({
        id: submitted.id,
        browserCapability: submitted.browserCapability,
        title: "Corrected title",
        type: "Bug Report",
      }),
    ).resolves.toMatchObject({
      id: "notion-page-id",
      title: "Corrected title",
      description: "Original description",
      type: "Bug Report",
      submitter: { name: "Ama", email: "ama@example.com" },
    });
    expect(mutations[0]).toEqual({
      properties: {
        "title-id": {
          title: [{ type: "text", text: { content: "Corrected title" } }],
        },
        "description-id": {
          rich_text: [
            { type: "text", text: { content: "Original description" } },
          ],
        },
        "type-id": { select: { name: "Bug Report" } },
      },
    });

    await expect(
      feedback.withdrawDraftPost({
        id: submitted.id,
        browserCapability: submitted.browserCapability,
      }),
    ).resolves.toBeUndefined();
    expect(mutations[1]).toEqual({ in_trash: true });
  });

  it("rejects Notion select values outside the Feedback domain", async () => {
    const page = notionPage({
      title: "Unexpected value",
      description: "A Team Member changed a select option.",
      type: "General Feedback",
      editTokenHash: "stored-hash",
    });
    const typeProperty = (page.properties as Record<string, unknown>).Type;
    Reflect.set(typeProperty as object, "select", { name: "Question" });
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(page));
    const feedback = createNotionFeedbackModule({
      token: "notion-token",
      dataSourceId: "feedback-data-source",
      propertyIds,
      request,
    });

    await expect(
      feedback.editDraftPost({
        id: "notion-page-id",
        browserCapability:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as BrowserCapability,
        title: "Do not map this",
      }),
    ).rejects.toThrow('Notion returned unsupported Feedback Type "Question".');
  });
});

function textContent(property: unknown): string {
  if (!property || typeof property !== "object") return "";
  const richText = Reflect.get(property, "rich_text");
  return Array.isArray(richText) && richText[0]?.plain_text
    ? String(richText[0].plain_text)
    : "";
}

function notionPage({
  id = "notion-page-id",
  slug,
  title,
  description,
  type,
  submitterName,
  submitterEmail,
  editTokenHash,
  status = "New",
  published = false,
}: {
  id?: string;
  slug?: string;
  title: string;
  description: string;
  type: "Feature Request" | "Bug Report" | "General Feedback";
  submitterName?: string;
  submitterEmail?: string;
  editTokenHash: string;
  status?:
    "New" | "Reviewing" | "Planned" | "In Progress" | "Shipped" | "Closed";
  published?: boolean;
}) {
  const canonicalSlug =
    slug ??
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  return {
    object: "page",
    id,
    created_time: "2026-08-20T13:00:00.000Z",
    last_edited_time: "2026-08-20T13:00:00.000Z",
    properties: {
      "Title from Notion": {
        id: "title-id",
        type: "title",
        title: [{ plain_text: title }],
      },
      Slug: {
        id: "slug-id",
        type: "rich_text",
        rich_text: [{ plain_text: canonicalSlug }],
      },
      "Description from Notion": {
        id: "description-id",
        type: "rich_text",
        rich_text: [{ plain_text: description }],
      },
      Type: { id: "type-id", type: "select", select: { name: type } },
      Status: { id: "status-id", type: "select", select: { name: status } },
      Published: {
        id: "published-id",
        type: "checkbox",
        checkbox: published,
      },
      "Submitter Name": {
        id: "submitter-name-id",
        type: "rich_text",
        rich_text: submitterName ? [{ plain_text: submitterName }] : [],
      },
      "Submitter Email": {
        id: "submitter-email-id",
        type: "email",
        email: submitterEmail ?? null,
      },
      "Edit Token Hash": {
        id: "edit-token-hash-id",
        type: "rich_text",
        rich_text: [{ plain_text: editTokenHash }],
      },
      "Product Team Priority": {
        id: "custom-priority",
        type: "number",
        number: 1,
      },
    },
    children: [{ type: "paragraph", paragraph: { private: "notes" } }],
  };
}
