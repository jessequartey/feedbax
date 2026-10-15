import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
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
  it.each([
    ["22.20.0", "fail"],
    ["24.14.1", "fail"],
    ["24.15.0", "pass"],
    ["24.22.0", "pass"],
    ["25.0.0", "fail"],
    ["26.0.0", "pass"],
  ])("checks the supported Node runtime (%s)", async (nodeVersion, status) => {
    const results = await diagnoseInstallation({
      cwd: await fixture(false),
      env,
      request: async () => Response.json(source()),
      execute,
      nodeVersion,
    });
    expect(results).toContainEqual(
      expect.objectContaining({ name: "Node.js", status }),
    );
    if (status === "fail")
      expect(results.find((result) => result.name === "Node.js")?.repair).toBe(
        "Install Node.js 24.15 or newer on the Node 24 LTS line, or Node 26+.",
      );
  });
  it.each([false, true])(
    "requires a matching bounded queue for small processing (configured: %s)",
    async (configured) => {
      const cwd = await fixture(false);
      const path = join(cwd, "src/feedbax.ts");
      const config = JSON.parse(
        (await readFile(path, "utf8")).replace("export default ", ""),
      );
      config.product.siteUrl = "https://feedback.example";
      config.connected = {
        issuer: "https://app.example",
        loginUrl: "https://app.example/login",
        processing: "small",
      };
      await writeFile(path, `export default ${JSON.stringify(config)}`);
      const wranglerPath = join(cwd, "wrangler.jsonc");
      const wrangler = JSON.parse(await readFile(wranglerPath, "utf8"));
      wrangler.triggers = { crons: ["*/5 * * * *"] };
      if (configured)
        wrangler.queues = {
          producers: [{ binding: "FEEDBAX_UPDATES", queue: "acme-updates" }],
          consumers: [
            {
              queue: "acme-updates",
              max_batch_size: 1,
              max_concurrency: 1,
              max_retries: 3,
              retry_delay: 60,
            },
          ],
        };
      await writeFile(wranglerPath, JSON.stringify(wrangler));
      const results = await diagnoseInstallation({
        cwd,
        env: {
          ...env,
          IDENTITY_HANDOFF_SECRET: "a-test-secret-at-least-32-characters",
        },
        request: async () => Response.json(source()),
        execute,
      });
      expect(results).toContainEqual(
        expect.objectContaining({
          name: "Connected processing queue",
          status: configured ? "pass" : "fail",
        }),
      );
    },
  );
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
    const request = vi.fn<typeof fetch>().mockImplementation(async (url) =>
      Response.json(
        String(url).includes("/views?")
          ? {
              results: [
                "Inbox",
                "Reviewing",
                "Prioritization",
                "Follow-up",
                "Roadmap",
                "Shipped",
              ].map((name) => ({ id: name, name })),
            }
          : source(),
      ),
    );
    const results = await diagnoseInstallation({
      cwd: await fixture(false),
      env,
      request,
      execute,
    });
    expect(diagnosticsPassed(results)).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
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

it("diagnoses GitHub-only D1 and paired access without requiring Notion or identity", async () => {
  const cwd = await fixture(false);
  const path = join(cwd, "src/feedbax.ts");
  const config = JSON.parse(
    (await readFile(path, "utf8")).replace("export default ", ""),
  );
  delete config.notion;
  config.provider = "github";
  config.product.siteUrl = "https://portal.example";
  config.github = {
    installationId: "portal-acme",
    serviceUrl: "https://service.example",
    repository: { id: 123, owner: "acme", name: "feedback" },
    botUserId: 456,
  };
  await writeFile(path, `export default ${JSON.stringify(config)}`);
  const wrangler = JSON.parse(
    await readFile(join(cwd, "wrangler.jsonc"), "utf8"),
  );
  wrangler.d1_databases = [
    {
      binding: "FEEDBAX_DB",
      database_id: "11111111-2222-3333-4444-555555555555",
      database_name: "acme",
    },
  ];
  wrangler.triggers = { crons: ["*/5 * * * *"] };
  await writeFile(join(cwd, "wrangler.jsonc"), JSON.stringify(wrangler));
  const urls: string[] = [];
  const results = await diagnoseInstallation({
    cwd,
    env: {
      FEEDBAX_API_KEY_HASH: "hash",
      PARTICIPATION_SIGNING_SECRET: "s".repeat(40),
      GITHUB_SERVICE_SECRET: "g".repeat(40),
    },
    execute,
    request: async (input, init) => {
      const request =
        input instanceof Request ? input : new Request(input, init);
      urls.push(request.url);
      if (request.url.endsWith("/v1/status"))
        return Response.json({
          active: true,
          lastDeliveryAt: Date.now(),
          pending: 0,
          terminalFailures: 0,
        });
      if (request.url.endsWith("/v1/token"))
        return Response.json({
          token: "scoped",
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
          repositoryId: 123,
          botUserId: 456,
        });
      return Response.json({ id: 123, private: true });
    },
  });
  expect(diagnosticsPassed(results)).toBe(true);
  expect(results).toContainEqual(
    expect.objectContaining({ name: "GitHub Portal Binding", status: "pass" }),
  );
  expect(
    results.some(
      (result) =>
        result.name.includes("Notion") || result.name === "NOTION_TOKEN",
    ),
  ).toBe(false);
  expect(urls.some((url) => url.includes("notion"))).toBe(false);
  expect(JSON.stringify(results)).not.toContain("scoped");
});
