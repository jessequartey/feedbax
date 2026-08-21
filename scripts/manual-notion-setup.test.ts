import { mkdtemp, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { provisionManualInstallation } from "./manual-notion-setup";

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
        ["Submitter Name", "submitter-name-id", "rich_text"],
        ["Submitter Email", "submitter-email-id", "email"],
        ["Source", "source-id", "select"],
        ["External ID", "external-id", "rich_text"],
        ["Edit Token Hash", "edit-token-hash-id", "rich_text"],
        ["Created At", "created-at-id", "created_time"],
        ["Updated At", "updated-at-id", "last_edited_time"],
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
      );
    const output = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = await provisionManualInstallation({
      token: "secret-notion-token",
      parentPageId: "parent-page-id",
      envFile,
      request,
    });

    expect(request).toHaveBeenCalledTimes(2);
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
    });
    const smokeApiKey = contents.match(/FEEDBAX_SMOKE_API_KEY=(.+)/)?.[1];
    expect(smokeApiKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(contents).toContain(
      `FEEDBAX_API_KEY_HASH=${createHash("sha256")
        .update(smokeApiKey ?? "")
        .digest("base64url")}`,
    );

    const transcript = output.mock.calls.flat().join("\n");
    expect(transcript).toContain("database-id");
    expect(transcript).toContain("data-source-id");
    expect(transcript).not.toContain("secret-notion-token");
    expect(transcript).not.toContain(
      contents.match(/FEEDBAX_SMOKE_API_KEY=(.+)/)?.[1],
    );
  });
});
