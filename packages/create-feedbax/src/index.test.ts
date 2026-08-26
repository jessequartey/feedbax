import { describe, expect, it, vi } from "vitest";

import {
  assertEnabledCommentCapabilities,
  collectFeatureSelection,
  verifySelectedCommentCapabilities,
  featureChoices,
  renderFeatureConfiguration,
  renderChangelogConfiguration,
  configureChangelogStorage,
  doctorChangelogStorage,
  doctorInstallation,
} from "./index";
import type { ChangelogPropertyIds } from "@feedbax/changelog";
import type { FeedbackPropertyIds } from "@feedbax/feedback";

describe("Comment capability verification", () => {
  it("runs both capability checks in the setup flow", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ results: [] }))
      .mockResolvedValueOnce(new Response(null, { status: 400 }));
    await expect(
      verifySelectedCommentCapabilities(
        { voting: true, comments: true, changelog: true },
        { token: "notion-token", pageId: "post-page", request },
      ),
    ).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      body: "{}",
    });
  });

  it("requires both native Comment capabilities when Comments are enabled", () => {
    expect(() =>
      assertEnabledCommentCapabilities({
        commentsEnabled: true,
        capabilities: { readComments: true, insertComments: false },
      }),
    ).toThrow(
      "Enable Insert comments in the Notion connection settings, then retry setup.",
    );
    expect(() =>
      assertEnabledCommentCapabilities({
        commentsEnabled: true,
        capabilities: { readComments: false, insertComments: true },
        command: "doctor",
      }),
    ).toThrow(
      "Enable Read comments in the Notion connection settings, then rerun doctor. No changes were made.",
    );
  });

  it("does not require Comment capabilities after an explicit opt-out", () => {
    expect(() =>
      assertEnabledCommentCapabilities({
        commentsEnabled: false,
        capabilities: { readComments: false, insertComments: false },
      }),
    ).not.toThrow();
  });
});

describe("Changelog setup and doctor", () => {
  it("always validates Feedback and conditionally validates enabled capabilities without mutation", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async (url) => {
      if (String(url).includes("comments")) {
        return String(url).endsWith("/comments")
          ? new Response(null, { status: 400 })
          : Response.json({ results: [] });
      }
      return Response.json(
        String(url).includes("feedback-source")
          ? feedbackDataSource()
          : dataSource("marketing-database"),
      );
    });

    await doctorInstallation({
      features: { voting: false, comments: true, changelog: false },
      feedback: {
        dataSourceId: "feedback-source",
        propertyIds: feedbackPropertyIds,
      },
      commentProbePageId: "post-page",
      token: "token",
      request,
    });

    expect(
      request.mock.calls.some(([url]) =>
        String(url).includes("feedback-source"),
      ),
    ).toBe(true);
    expect(
      request.mock.calls.some(([url]) => String(url).includes("comments")),
    ).toBe(true);
    expect(
      request.mock.calls.some(([url]) =>
        String(url).includes("changelog-source"),
      ),
    ).toBe(false);
    expect(
      request.mock.calls.every(
        ([, init]) => !init?.method || init.method === "GET",
      ),
    ).toBe(true);
  });

  it("previews sibling creation before applying it and creates no sample entries", async () => {
    const events: string[] = [];
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async (_url, init) => {
        events.push("request");
        expect(JSON.parse(String(init?.body))).not.toHaveProperty("children");
        return Response.json(dataSource());
      });
    const result = await configureChangelogStorage({
      features: { voting: true, comments: true, changelog: true },
      selection: { kind: "create", databaseId: "feedback-database" },
      token: "token",
      request,
      preview: async (message) => {
        events.push(`preview:${message}`);
        return true;
      },
    });
    expect(events[0]).toContain(
      "preview:Create an empty Changelog Data Source",
    );
    expect(events[1]).toBe("request");
    expect(result?.databaseId).toBe("feedback-database");
  });

  it("validates an existing external source and keeps doctor read-only", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        Response.json(dataSource("marketing-database")),
      );
    const selection = {
      kind: "existing" as const,
      dataSourceId: "changelog-source",
      propertyIds,
    };
    await expect(
      configureChangelogStorage({
        features: { voting: true, comments: true, changelog: true },
        selection,
        token: "token",
        request,
        preview: async () => true,
      }),
    ).resolves.toMatchObject({ databaseId: "marketing-database" });
    await expect(
      doctorChangelogStorage({
        enabled: true,
        configuration: {
          databaseId: "marketing-database",
          dataSourceId: "changelog-source",
          propertyIds,
        },
        token: "token",
        request,
      }),
    ).resolves.toBeUndefined();
    expect(
      request.mock.calls.every(
        ([, init]) => !init?.method || init.method === "GET",
      ),
    ).toBe(true);
  });

  it("does nothing after Changelog opt-out or a declined preview", async () => {
    const request = vi.fn<typeof fetch>();
    await expect(
      configureChangelogStorage({
        features: { voting: true, comments: true, changelog: false },
        token: "token",
        request,
        preview: async () => true,
      }),
    ).resolves.toBeUndefined();
    await expect(
      configureChangelogStorage({
        features: { voting: true, comments: true, changelog: true },
        selection: { kind: "create", databaseId: "feedback-database" },
        token: "token",
        request,
        preview: async () => false,
      }),
    ).rejects.toThrow("Changelog creation was not approved");
    expect(request).not.toHaveBeenCalled();
  });
});

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

const feedbackPropertyIds: FeedbackPropertyIds = {
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

function feedbackDataSource() {
  const names: Record<keyof FeedbackPropertyIds, [string, string]> = {
    title: ["Title", "title"],
    slug: ["Slug", "rich_text"],
    description: ["Description", "rich_text"],
    type: ["Type", "select"],
    status: ["Status", "select"],
    published: ["Published", "checkbox"],
    voteCount: ["Vote Count", "number"],
    submitterName: ["Submitter Name", "rich_text"],
    submitterEmail: ["Submitter Email", "email"],
    source: ["Source", "select"],
    externalId: ["External ID", "rich_text"],
    editTokenHash: ["Edit Token Hash", "rich_text"],
    createdAt: ["Created At", "created_time"],
    updatedAt: ["Updated At", "last_edited_time"],
  };
  return {
    id: "feedback-source",
    parent: { database_id: "feedback-database" },
    properties: Object.fromEntries(
      Object.entries(names).map(([key, [name, type]]) => [
        name,
        {
          id: feedbackPropertyIds[key as keyof FeedbackPropertyIds],
          name,
          type,
        },
      ]),
    ),
  };
}

function dataSource(databaseId = "feedback-database") {
  const names: Record<keyof ChangelogPropertyIds, [string, string]> = {
    title: ["Title", "title"],
    slug: ["Slug", "rich_text"],
    date: ["Date", "date"],
    summary: ["Summary", "rich_text"],
    body: ["Body", "rich_text"],
    labels: ["Labels", "multi_select"],
    image: ["Image", "files"],
    published: ["Published", "checkbox"],
    createdAt: ["Created At", "created_time"],
    updatedAt: ["Updated At", "last_edited_time"],
  };
  return {
    id: "changelog-source",
    parent: { database_id: databaseId },
    properties: Object.fromEntries(
      Object.entries(names).map(([key, [name, type]]) => [
        name,
        { id: propertyIds[key as keyof ChangelogPropertyIds], name, type },
      ]),
    ),
  };
}

describe("creator capability choices", () => {
  it("renders every independent capability combination without secrets", () => {
    for (let mask = 0; mask < 8; mask += 1) {
      const rendered = renderFeatureConfiguration({
        voting: Boolean(mask & 1),
        comments: Boolean(mask & 2),
        changelog: Boolean(mask & 4),
      });
      expect(rendered).toContain(`voting: ${Boolean(mask & 1)}`);
      expect(rendered).toContain(`comments: ${Boolean(mask & 2)}`);
      expect(rendered).toContain(`changelog: ${Boolean(mask & 4)}`);
      expect(rendered).not.toMatch(/token|secret|api.?key/i);
    }
  });

  it("presents every capability as enabled by default", async () => {
    const prompts: { message: string; initialValue: boolean }[] = [];
    const confirm = async (input: {
      message: string;
      initialValue: boolean;
    }) => {
      prompts.push(input);
      return true;
    };

    await expect(collectFeatureSelection({ confirm })).resolves.toEqual({
      voting: true,
      comments: true,
      changelog: true,
    });
    expect(featureChoices.map(({ key }) => key)).toEqual([
      "voting",
      "comments",
      "changelog",
    ]);
    expect(prompts.map(({ initialValue }) => initialValue)).toEqual([
      true,
      true,
      true,
    ]);
  });

  it("emits explicit opt-outs in typed configuration", async () => {
    const answers = [true, false, true];
    const features = await collectFeatureSelection({
      confirm: async () => answers.shift() ?? true,
    });

    expect(renderFeatureConfiguration(features)).toBe(`features: {
    voting: true,
    comments: false,
    changelog: true,
  },`);
  });

  it("emits selected Changelog identifiers and stable property mappings", () => {
    expect(
      renderChangelogConfiguration({
        databaseId: "database-id",
        dataSourceId: "data-source-id",
        propertyIds,
      }),
    ).toContain('dataSourceId: "data-source-id"');
    expect(
      renderChangelogConfiguration({
        databaseId: "database-id",
        dataSourceId: "data-source-id",
        propertyIds,
      }),
    ).toContain('updatedAt: "updated-id"');
  });
});
