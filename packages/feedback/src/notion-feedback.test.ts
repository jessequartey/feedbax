import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  createNotionFeedbackModule,
  type BrowserCapability,
  type FeedbackPropertyIds,
} from "./index";

const propertyIds: FeedbackPropertyIds = {
  title: "title-id",
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
  it("submits canonical properties while keeping the raw Browser Capability out of Notion", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        notionPage({
          title: "Search needs keyboard shortcuts",
          description: "Let me open search without reaching for the mouse.",
          type: "Feature Request",
          submitterName: "Ama",
          submitterEmail: "ama@example.com",
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

    const submitted = await feedback.submit({
      title: "Search needs keyboard shortcuts",
      description: "Let me open search without reaching for the mouse.",
      type: "Feature Request",
      submitter: { name: "Ama", email: "ama@example.com" },
    });

    expect(request).toHaveBeenCalledOnce();
    const [url, init] = request.mock.calls[0]!;
    expect(url).toBe("https://api.notion.com/v1/pages");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer notion-token",
        "Content-Type": "application/json",
        "Notion-Version": "2026-03-11",
      },
    });
    const body = JSON.parse(String(init?.body)) as {
      parent: unknown;
      properties: Record<string, unknown>;
    };
    expect(body.parent).toEqual({
      type: "data_source_id",
      data_source_id: "feedback-data-source",
    });
    expect(body.properties).toMatchObject({
      "title-id": {
        title: [{ type: "text", text: { content: submitted.title } }],
      },
      "description-id": {
        rich_text: [{ type: "text", text: { content: submitted.description } }],
      },
      "type-id": { select: { name: "Feature Request" } },
      "status-id": { select: { name: "New" } },
      "published-id": { checkbox: false },
      "submitter-name-id": {
        rich_text: [{ type: "text", text: { content: "Ama" } }],
      },
      "submitter-email-id": { email: "ama@example.com" },
      "source-id": { select: { name: "Portal" } },
      "edit-token-hash-id": {
        rich_text: [
          {
            type: "text",
            text: {
              content: createHash("sha256")
                .update(submitted.browserCapability)
                .digest("base64url"),
            },
          },
        ],
      },
    });
    expect(JSON.stringify(body)).not.toContain(submitted.browserCapability);
    expect(body.properties).not.toHaveProperty("created-at-id");
    expect(body.properties).not.toHaveProperty("updated-at-id");
    expect(submitted.id).toBe("notion-page-id");
    expect(Object.keys(submitted).sort()).toEqual([
      "browserCapability",
      "createdAt",
      "description",
      "id",
      "published",
      "status",
      "submitter",
      "title",
      "type",
      "updatedAt",
    ]);
    expect(submitted).not.toHaveProperty("children");
    expect(submitted).not.toHaveProperty("Product Team Priority");
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
      if (url.endsWith("/pages") && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as {
          properties: Record<
            string,
            { rich_text?: Array<{ text: { content: string } }> }
          >;
        };
        page = notionPage({
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
          title: "Corrected title",
          description: "Original description",
          type: "Bug Report",
          submitterName: "Amina",
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
    const submitted = await feedback.submit({
      title: "Original title",
      description: "Original description",
      type: "General Feedback",
      submitter: { name: "Ama", email: "ama@example.com" },
    });

    await expect(
      feedback.editDraft({
        id: submitted.id,
        browserCapability:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as BrowserCapability,
        title: "Unauthorized title",
      }),
    ).rejects.toThrow("Browser Capability did not authorize this draft.");
    expect(mutations).toHaveLength(0);

    await expect(
      feedback.editDraft({
        id: submitted.id,
        browserCapability: submitted.browserCapability,
        title: "Corrected title",
        type: "Bug Report",
        submitter: { name: "Amina" },
      }),
    ).resolves.toMatchObject({
      id: "notion-page-id",
      title: "Corrected title",
      description: "Original description",
      type: "Bug Report",
      submitter: { name: "Amina", email: "ama@example.com" },
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
        "submitter-name-id": {
          rich_text: [{ type: "text", text: { content: "Amina" } }],
        },
        "submitter-email-id": { email: "ama@example.com" },
      },
    });

    await expect(
      feedback.withdrawDraft({
        id: submitted.id,
        browserCapability: submitted.browserCapability,
      }),
    ).resolves.toBeUndefined();
    expect(mutations[1]).toEqual({ in_trash: true });
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
  title,
  description,
  type,
  submitterName,
  submitterEmail,
  editTokenHash,
}: {
  title: string;
  description: string;
  type: "Feature Request" | "Bug Report" | "General Feedback";
  submitterName?: string;
  submitterEmail?: string;
  editTokenHash: string;
}) {
  return {
    object: "page",
    id: "notion-page-id",
    created_time: "2026-08-20T13:00:00.000Z",
    last_edited_time: "2026-08-20T13:00:00.000Z",
    properties: {
      "Title from Notion": {
        id: "title-id",
        type: "title",
        title: [{ plain_text: title }],
      },
      "Description from Notion": {
        id: "description-id",
        type: "rich_text",
        rich_text: [{ plain_text: description }],
      },
      Type: { id: "type-id", type: "select", select: { name: type } },
      Status: { id: "status-id", type: "select", select: { name: "New" } },
      Published: {
        id: "published-id",
        type: "checkbox",
        checkbox: false,
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
