import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  feedbaxRoadmap,
  provisionManualInstallation,
} from "./manual-notion-setup";

describe("manual Notion setup", () => {
  it("writes the complete local contract without printing secrets", async () => {
    const directory = await mkdtemp(join(tmpdir(), "feedbax-manual-setup-"));
    const envFile = join(directory, ".dev.vars");
    const properties = Object.fromEntries(
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
    );
    const changelogProperties = Object.fromEntries(
      [
        ["Title", "changelog-title-id", "title"],
        ["Slug", "changelog-slug-id", "rich_text"],
        ["Date", "changelog-date-id", "date"],
        ["Summary", "changelog-summary-id", "rich_text"],
        ["Body", "changelog-body-id", "rich_text"],
        ["Labels", "changelog-labels-id", "multi_select"],
        ["Image", "changelog-image-id", "files"],
        ["Published", "changelog-published-id", "checkbox"],
        ["Created At", "changelog-created-at-id", "created_time"],
        ["Updated At", "changelog-updated-at-id", "last_edited_time"],
      ].map(([name, id, type]) => [name, { id, name, type }]),
    );
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          id: "database-id",
          data_sources: [{ id: "data-source-id" }],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ id: "data-source-id", properties }),
      )
      .mockResolvedValueOnce(
        Response.json({
          id: "changelog-data-source-id",
          parent: { type: "database_id", database_id: "database-id" },
          properties: changelogProperties,
        }),
      );
    for (const [index] of feedbaxRoadmap.entries()) {
      request.mockResolvedValueOnce(Response.json({ id: `roadmap-${index}` }));
    }
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = await provisionManualInstallation({
      token: "secret-notion-token",
      parentPageId: "parent-page-id",
      envFile,
      request,
    });

    expect(request).toHaveBeenCalledTimes(3 + feedbaxRoadmap.length);
    expect(request).toHaveBeenNthCalledWith(
      1,
      "https://api.notion.com/v1/databases",
      expect.objectContaining({ method: "POST" }),
    );
    const expectedPropertyIds = {
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
    expect(result).toEqual({
      databaseId: "database-id",
      dataSourceId: "data-source-id",
      propertyIds: expectedPropertyIds,
      changelog: {
        databaseId: "database-id",
        dataSourceId: "changelog-data-source-id",
        propertyIds: {
          title: "changelog-title-id",
          slug: "changelog-slug-id",
          date: "changelog-date-id",
          summary: "changelog-summary-id",
          body: "changelog-body-id",
          labels: "changelog-labels-id",
          image: "changelog-image-id",
          published: "changelog-published-id",
          createdAt: "changelog-created-at-id",
          updatedAt: "changelog-updated-at-id",
        },
      },
      seededPageIds: feedbaxRoadmap.map((_, index) => `roadmap-${index}`),
      backupFile: undefined,
      envFile,
    });

    const contents = await readFile(envFile, "utf8");
    expect(contents).toContain("NOTION_TOKEN=secret-notion-token");
    expect(contents).toContain("NOTION_FEEDBACK_DATA_SOURCE_ID=data-source-id");
    expect(
      Object.fromEntries(
        contents
          .trim()
          .split("\n")
          .map((line) => {
            const separator = line.indexOf("=");
            return [line.slice(0, separator), line.slice(separator + 1)];
          }),
      ),
    ).toMatchObject({
      NOTION_FEEDBACK_TITLE_PROPERTY_ID: expectedPropertyIds.title,
      NOTION_FEEDBACK_SLUG_PROPERTY_ID: expectedPropertyIds.slug,
      NOTION_FEEDBACK_DESCRIPTION_PROPERTY_ID: expectedPropertyIds.description,
      NOTION_FEEDBACK_TYPE_PROPERTY_ID: expectedPropertyIds.type,
      NOTION_FEEDBACK_STATUS_PROPERTY_ID: expectedPropertyIds.status,
      NOTION_FEEDBACK_PUBLISHED_PROPERTY_ID: expectedPropertyIds.published,
      NOTION_FEEDBACK_VOTE_COUNT_PROPERTY_ID: expectedPropertyIds.voteCount,
      NOTION_FEEDBACK_SUBMITTER_NAME_PROPERTY_ID:
        expectedPropertyIds.submitterName,
      NOTION_FEEDBACK_SUBMITTER_EMAIL_PROPERTY_ID:
        expectedPropertyIds.submitterEmail,
      NOTION_FEEDBACK_SOURCE_PROPERTY_ID: expectedPropertyIds.source,
      NOTION_FEEDBACK_EXTERNAL_ID_PROPERTY_ID: expectedPropertyIds.externalId,
      NOTION_FEEDBACK_EDIT_TOKEN_HASH_PROPERTY_ID:
        expectedPropertyIds.editTokenHash,
      NOTION_FEEDBACK_CREATED_AT_PROPERTY_ID: expectedPropertyIds.createdAt,
      NOTION_FEEDBACK_UPDATED_AT_PROPERTY_ID: expectedPropertyIds.updatedAt,
      NOTION_FEEDBACK_DATABASE_ID: "database-id",
      NOTION_CHANGELOG_DATABASE_ID: "database-id",
      NOTION_CHANGELOG_DATA_SOURCE_ID: "changelog-data-source-id",
      NOTION_CHANGELOG_TITLE_PROPERTY_ID: "changelog-title-id",
      NOTION_CHANGELOG_SLUG_PROPERTY_ID: "changelog-slug-id",
      NOTION_CHANGELOG_DATE_PROPERTY_ID: "changelog-date-id",
      NOTION_CHANGELOG_SUMMARY_PROPERTY_ID: "changelog-summary-id",
      NOTION_CHANGELOG_BODY_PROPERTY_ID: "changelog-body-id",
      NOTION_CHANGELOG_LABELS_PROPERTY_ID: "changelog-labels-id",
      NOTION_CHANGELOG_IMAGE_PROPERTY_ID: "changelog-image-id",
      NOTION_CHANGELOG_PUBLISHED_PROPERTY_ID: "changelog-published-id",
      NOTION_CHANGELOG_CREATED_AT_PROPERTY_ID: "changelog-created-at-id",
      NOTION_CHANGELOG_UPDATED_AT_PROPERTY_ID: "changelog-updated-at-id",
      NOTION_COMMENT_CAPABILITY_PROBE_PAGE_ID: "roadmap-0",
    });
    const smokeApiKey = contents.match(/FEEDBAX_SMOKE_API_KEY=(.+)/)?.[1];
    expect(smokeApiKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(contents).toContain(
      `FEEDBAX_API_KEY_HASH=${createHash("sha256")
        .update(smokeApiKey ?? "")
        .digest("base64url")}`,
    );
    expect(contents.match(/PARTICIPATION_SIGNING_SECRET=(.+)/)?.[1]).toMatch(
      /^[A-Za-z0-9_-]{43}$/,
    );

    const transcript = output.mock.calls.flat().join("\n");
    expect(transcript).toContain("database-id");
    expect(transcript).toContain("data-source-id");
    expect(transcript).not.toContain("secret-notion-token");
    expect(transcript).not.toContain(
      contents.match(/FEEDBAX_SMOKE_API_KEY=(.+)/)?.[1],
    );
  });

  it("backs up and preserves unrelated local configuration", async () => {
    const directory = await mkdtemp(join(tmpdir(), "feedbax-manual-setup-"));
    const envFile = join(directory, ".dev.vars");
    await writeFile(
      envFile,
      "UNRELATED=value\nNOTION_FEEDBACK_DATA_SOURCE_ID=old-source\n",
    );
    const request = completeInstallationRequest();
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = await provisionManualInstallation({
      token: "new-token",
      parentPageId: "parent-page-id",
      envFile,
      request,
    });

    expect(await readFile(envFile, "utf8")).toContain("UNRELATED=value");
    expect(await readFile(envFile, "utf8")).toContain(
      "NOTION_FEEDBACK_DATA_SOURCE_ID=data-source-id",
    );
    expect(await readFile(result.backupFile!, "utf8")).toBe(
      "UNRELATED=value\nNOTION_FEEDBACK_DATA_SOURCE_ID=old-source\n",
    );
  });

  it("leaves local configuration unchanged when a remote write fails", async () => {
    const directory = await mkdtemp(join(tmpdir(), "feedbax-manual-setup-"));
    const envFile = join(directory, ".dev.vars");
    const original = "NOTION_FEEDBACK_DATA_SOURCE_ID=old-source\n";
    await writeFile(envFile, original);
    const request = completeInstallationRequest();
    request.mockReset();
    request.mockResolvedValueOnce(
      Response.json({
        id: "database-id",
        data_sources: [{ id: "data-source-id" }],
      }),
    );
    request.mockResolvedValueOnce(
      Response.json({ id: "data-source-id", properties: feedbackProperties() }),
    );
    request.mockResolvedValueOnce(new Response("failed", { status: 500 }));

    await expect(
      provisionManualInstallation({
        token: "new-token",
        parentPageId: "parent-page-id",
        envFile,
        request,
      }),
    ).rejects.toThrow();
    expect(await readFile(envFile, "utf8")).toBe(original);
  });
});

function feedbackProperties() {
  return Object.fromEntries(
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
  );
}

function completeInstallationRequest() {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        id: "database-id",
        data_sources: [{ id: "data-source-id" }],
      }),
    )
    .mockResolvedValueOnce(
      Response.json({ id: "data-source-id", properties: feedbackProperties() }),
    )
    .mockResolvedValueOnce(
      Response.json({
        id: "changelog-data-source-id",
        parent: { type: "database_id", database_id: "database-id" },
        properties: Object.fromEntries(
          [
            ["Title", "changelog-title-id", "title"],
            ["Slug", "changelog-slug-id", "rich_text"],
            ["Date", "changelog-date-id", "date"],
            ["Summary", "changelog-summary-id", "rich_text"],
            ["Body", "changelog-body-id", "rich_text"],
            ["Labels", "changelog-labels-id", "multi_select"],
            ["Image", "changelog-image-id", "files"],
            ["Published", "changelog-published-id", "checkbox"],
            ["Created At", "changelog-created-at-id", "created_time"],
            ["Updated At", "changelog-updated-at-id", "last_edited_time"],
          ].map(([name, id, type]) => [name, { id, name, type }]),
        ),
      }),
    );
  for (const [index] of feedbaxRoadmap.entries()) {
    request.mockResolvedValueOnce(Response.json({ id: `roadmap-${index}` }));
  }
  return request;
}
