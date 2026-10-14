import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { diagnoseInstallation, diagnosticsPassed } from "./doctor";
const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(
    temporary
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});
const types = {
  title: "title",
  slug: "rich_text",
  description: "rich_text",
  type: "select",
  status: "select",
  published: "checkbox",
  voteCount: "number",
  teamResponse: "rich_text",
  releaseNotesUrl: "url",
  submitterName: "rich_text",
  submitterEmail: "email",
  source: "select",
  externalId: "rich_text",
  editTokenHash: "rich_text",
  createdAt: "created_time",
  updatedAt: "last_edited_time",
};
async function fixture(comments: boolean) {
  const cwd = await mkdtemp(join(tmpdir(), "feedbax-doctor-"));
  temporary.push(cwd);
  await mkdir(join(cwd, "src"));
  const config = {
    product: { name: "Acme", description: "Feedback", logo: "/logo.svg" },
    theme: { preset: "lyra-neutral" },
    notion: {
      databaseId: "database",
      dataSourceId: "source-from-config",
      properties: Object.fromEntries(
        Object.keys(types).map((key) => [key, `${key}-stable-id`]),
      ),
    },
    features: { voting: false, comments, changelog: false },
    submissions: {
      moderation: "required",
      maxTitleLength: 160,
      maxDescriptionLength: 5000,
    },
    turnstile: { enabled: false },
  };
  await writeFile(
    join(cwd, "src/feedbax.ts"),
    `export default ${JSON.stringify(config)}`,
  );
  await writeFile(
    join(cwd, "wrangler.jsonc"),
    JSON.stringify({
      name: "acme",
      ratelimits: [
        { name: "TRUSTED_SUBMISSIONS_RATE_LIMITER" },
        { name: "PORTAL_SUBMISSIONS_RATE_LIMITER" },
      ],
    }),
  );
  return cwd;
}
const env = {
  NOTION_TOKEN: "test-token",
  FEEDBAX_API_KEY_HASH: "hash",
  PARTICIPATION_SIGNING_SECRET: "signing",
  FEEDBAX_COMMENTS_ENABLED: "true",
};
const execute = async () => ({ stdout: "10.29.3\n" });
const source = () => ({
  properties: Object.fromEntries(
    Object.entries(types).map(([key, type]) => [
      `Renamed ${key}`,
      {
        id: `${key}-stable-id`,
        type,
        select: {
          options: (
            {
              type: ["Feature Request", "Bug Report", "General Feedback"],
              status: [
                "New",
                "Reviewing",
                "Planned",
                "In Progress",
                "Shipped",
                "Closed",
              ],
              source: ["Portal", "API", "Team"],
            }[key as "type"] ?? []
          ).map((name) => ({ name })),
        },
      },
    ]),
  ),
});
describe("doctor diagnostics", () => {
  it("returns structured failures without making external changes when configuration is missing", async () => {
    const request = vi.fn<typeof fetch>();
    const results = await diagnoseInstallation({
      cwd: "/missing-installation",
      env: {},
      request,
      execute,
    });
    expect(diagnosticsPassed(results)).toBe(false);
    expect(results).toContainEqual(
      expect.objectContaining({
        name: "Configuration",
        status: "fail",
        repair: expect.any(String),
      }),
    );
    expect(request).not.toHaveBeenCalled();
  });
  it("uses typed feature switches and stable IDs even after properties are renamed", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json(source()));
    const results = await diagnoseInstallation({
      cwd: await fixture(false),
      env,
      request,
      execute,
    });
    expect(diagnosticsPassed(results)).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      expect.stringContaining("/data_sources/source-from-config"),
      expect.not.objectContaining({ method: expect.anything() }),
    );
  });
  it.each([401, 403, 404, 429, 500])(
    "fails enabled Comment checks on HTTP %s using GET only",
    async (status) => {
      const request = vi
        .fn<typeof fetch>()
        .mockImplementation(async (url) =>
          String(url).includes("/comments?")
            ? new Response(null, { status })
            : Response.json(source()),
        );
      const results = await diagnoseInstallation({
        cwd: await fixture(true),
        env: { ...env, FEEDBAX_COMMENTS_ENABLED: "false" },
        request,
        execute,
      });
      expect(results).toContainEqual(
        expect.objectContaining({
          name: "Notion Comments",
          status: "fail",
          message: expect.stringContaining(String(status)),
        }),
      );
      expect(
        request.mock.calls.every(
          ([, options]) => !options?.method || options.method === "GET",
        ),
      ).toBe(true);
    },
  );
});
