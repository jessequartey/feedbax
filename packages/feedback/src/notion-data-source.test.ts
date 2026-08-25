import { describe, expect, it, vi } from "vitest";

import {
  createNotionFeedbackDataSource,
  validateNotionFeedbackDataSource,
  type FeedbackPropertyIds,
} from "./index";

const propertyIds: FeedbackPropertyIds = {
  title: "title-id",
  slug: "slug-id",
  description: "description-id",
  type: "type-id",
  status: "status-id",
  published: "published-id",
  voteCount: "vote-count-id",
  submitterName: "submitter-name-id",
  submitterEmail: "submitter-email-id",
  source: "source-id",
  externalId: "external-id",
  editTokenHash: "edit-token-hash-id",
  createdAt: "created-at-id",
  updatedAt: "updated-at-id",
};

describe("Notion Feedback Data Source", () => {
  it("retries transient failures while validating a Feedback Data Source", async () => {
    const delays: number[] = [];
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          { object: "error", message: "rate limited" },
          { status: 429, headers: { "Retry-After": "1" } },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({
          object: "data_source",
          id: "feedback-data-source",
          parent: { type: "database_id", database_id: "feedback-database" },
          properties: Object.fromEntries(
            Object.entries(propertyIds).map(([key, id]) => [
              key,
              { id, name: key, type: expectedTypes[key] },
            ]),
          ),
        }),
      );

    await expect(
      validateNotionFeedbackDataSource({
        token: "notion-token",
        dataSourceId: "feedback-data-source",
        propertyIds,
        request,
        retry: {
          sleep: async (milliseconds) => {
            delays.push(milliseconds);
          },
          random: () => 0,
        },
      }),
    ).resolves.toMatchObject({ dataSourceId: "feedback-data-source" });
    expect(request).toHaveBeenCalledTimes(2);
    expect(delays).toEqual([1_000]);
  });

  it("creates every canonical property with Notion API 2026-03-11", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          object: "database",
          id: "feedback-database",
          data_sources: [
            { id: "feedback-data-source", name: "Feedback data source" },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          object: "data_source",
          id: "feedback-data-source",
          properties: Object.fromEntries(
            [
              ["Title", "title-id", "title"],
              ["Slug", "slug-id", "rich_text"],
              ["Description", "description-id", "rich_text"],
              ["Type", "type-id", "select"],
              ["Status", "status-id", "select"],
              ["Published", "published-id", "checkbox"],
              ["Vote Count", "vote-count-id", "number"],
              ["Submitter Name", "submitter-name-id", "rich_text"],
              ["Submitter Email", "submitter-email-id", "email"],
              ["Source", "source-id", "select"],
              ["External ID", "external-id", "rich_text"],
              ["Edit Token Hash", "edit-token-hash-id", "rich_text"],
              ["Created At", "created-at-id", "created_time"],
              ["Updated At", "updated-at-id", "last_edited_time"],
            ].map(([name, id, type]) => [name, { id, name, type }]),
          ),
        }),
      );

    const result = await createNotionFeedbackDataSource({
      token: "notion-token",
      parentPageId: "parent-page",
      request,
    });

    expect(request).toHaveBeenNthCalledWith(
      1,
      "https://api.notion.com/v1/databases",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer notion-token",
          "Content-Type": "application/json",
          "Notion-Version": "2026-03-11",
        },
      }),
    );
    const body = JSON.parse(String(request.mock.calls[0]?.[1]?.body)) as Record<
      string,
      unknown
    >;
    expect(body).toEqual({
      parent: { type: "page_id", page_id: "parent-page" },
      title: [{ type: "text", text: { content: "Feedback" } }],
      initial_data_source: {
        properties: {
          Title: { title: {} },
          Slug: { rich_text: {} },
          Description: { rich_text: {} },
          Type: {
            select: {
              options: [
                { name: "Feature Request" },
                { name: "Bug Report" },
                { name: "General Feedback" },
              ],
            },
          },
          Status: {
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
          Published: { checkbox: {} },
          "Vote Count": { number: { format: "number" } },
          "Submitter Name": { rich_text: {} },
          "Submitter Email": { email: {} },
          Source: {
            select: {
              options: [{ name: "Portal" }, { name: "API" }, { name: "Team" }],
            },
          },
          "External ID": { rich_text: {} },
          "Edit Token Hash": { rich_text: {} },
          "Created At": { created_time: {} },
          "Updated At": { last_edited_time: {} },
        },
      },
    });
    expect(request).toHaveBeenNthCalledWith(
      2,
      "https://api.notion.com/v1/data_sources/feedback-data-source",
      {
        method: "GET",
        headers: {
          Authorization: "Bearer notion-token",
          "Content-Type": "application/json",
          "Notion-Version": "2026-03-11",
        },
      },
    );
    expect(result).toEqual({
      databaseId: "feedback-database",
      dataSourceId: "feedback-data-source",
      propertyIds: {
        title: "title-id",
        slug: "slug-id",
        description: "description-id",
        type: "type-id",
        status: "status-id",
        published: "published-id",
        voteCount: "vote-count-id",
        submitterName: "submitter-name-id",
        submitterEmail: "submitter-email-id",
        source: "source-id",
        externalId: "external-id",
        editTokenHash: "edit-token-hash-id",
        createdAt: "created-at-id",
        updatedAt: "updated-at-id",
      },
    });
  });

  it("accepts renamed required properties and additional Product Team properties", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        object: "data_source",
        id: "feedback-data-source",
        parent: { type: "database_id", database_id: "feedback-database" },
        properties: {
          Summary: { id: "title-id", name: "Summary", type: "title" },
          Path: { id: "slug-id", name: "Path", type: "rich_text" },
          Details: {
            id: "description-id",
            name: "Details",
            type: "rich_text",
          },
          Kind: { id: "type-id", name: "Kind", type: "select" },
          Workflow: { id: "status-id", name: "Workflow", type: "select" },
          Visible: {
            id: "published-id",
            name: "Visible",
            type: "checkbox",
          },
          Votes: { id: "vote-count-id", name: "Votes", type: "number" },
          Contact: {
            id: "submitter-name-id",
            name: "Contact",
            type: "rich_text",
          },
          Email: {
            id: "submitter-email-id",
            name: "Email",
            type: "email",
          },
          Origin: { id: "source-id", name: "Origin", type: "select" },
          Reference: {
            id: "external-id",
            name: "Reference",
            type: "rich_text",
          },
          Capability: {
            id: "edit-token-hash-id",
            name: "Capability",
            type: "rich_text",
          },
          Submitted: {
            id: "created-at-id",
            name: "Submitted",
            type: "created_time",
          },
          Changed: {
            id: "updated-at-id",
            name: "Changed",
            type: "last_edited_time",
          },
          Priority: { id: "custom-priority", name: "Priority", type: "number" },
        },
      }),
    );

    await expect(
      validateNotionFeedbackDataSource({
        token: "notion-token",
        dataSourceId: "feedback-data-source",
        propertyIds,
        request,
      }),
    ).resolves.toEqual({
      databaseId: "feedback-database",
      dataSourceId: "feedback-data-source",
      propertyIds,
    });
    expect(request).toHaveBeenCalledWith(
      "https://api.notion.com/v1/data_sources/feedback-data-source",
      {
        method: "GET",
        headers: {
          Authorization: "Bearer notion-token",
          "Content-Type": "application/json",
          "Notion-Version": "2026-03-11",
        },
      },
    );
  });

  it("reports precise repairs for missing and incompatible required properties", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        object: "data_source",
        id: "feedback-data-source",
        parent: { type: "database_id", database_id: "feedback-database" },
        properties: Object.fromEntries(
          Object.entries(propertyIds)
            .filter(([key]) => key !== "description")
            .map(([key, id]) => [
              key,
              {
                id,
                name: key,
                type: key === "published" ? "rich_text" : expectedTypes[key],
              },
            ]),
        ),
      }),
    );

    await expect(
      validateNotionFeedbackDataSource({
        token: "notion-token",
        dataSourceId: "feedback-data-source",
        propertyIds,
        request,
      }),
    ).rejects.toThrow(
      [
        'Restore the "Description" property with ID "description-id" and type "rich_text", then update the configured property ID if Notion assigns a new one.',
        'Change the property configured as "Published" (ID "published-id") from "rich_text" to "checkbox", or restore a checkbox property and configure its ID.',
      ].join("\n"),
    );
  });
});

const expectedTypes: Record<string, string> = {
  title: "title",
  slug: "rich_text",
  description: "rich_text",
  type: "select",
  status: "select",
  published: "checkbox",
  voteCount: "number",
  submitterName: "rich_text",
  submitterEmail: "email",
  source: "select",
  externalId: "rich_text",
  editTokenHash: "rich_text",
  createdAt: "created_time",
  updatedAt: "last_edited_time",
};
