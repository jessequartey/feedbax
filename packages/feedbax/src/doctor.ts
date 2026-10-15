import { spawn } from "node:child_process";
import type { FeedbaxConfig } from "../../config/src/index";
import {
  loadInstallationConfig,
  readLocalEnvironment,
  readWranglerConfiguration,
} from "./installation";

export type Diagnostic = {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
  repair?: string;
};
type Execute = (
  command: string,
  args: string[],
  cwd: string,
) => Promise<{ stdout: string }>;

export async function diagnoseInstallation({
  cwd = process.cwd(),
  env = process.env,
  request = fetch,
  execute = runCommand,
}: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  request?: typeof fetch;
  execute?: Execute;
} = {}): Promise<Diagnostic[]> {
  const results: Diagnostic[] = [];
  const effectiveEnv = { ...(await readLocalEnvironment(cwd)), ...env };
  const [nodeMajor = 0, nodeMinor = 0] = process.versions.node
    .split(".")
    .map(Number);
  results.push(
    nodeMajor > 22 || (nodeMajor === 22 && nodeMinor >= 14)
      ? pass("Node.js", `Node ${process.versions.node} is supported.`)
      : fail(
          "Node.js",
          "Unsupported Node version.",
          "Install Node.js 22.14 or newer.",
        ),
  );
  await check("pnpm", async () => {
    const { stdout } = await execute("pnpm", ["--version"], cwd);
    if (Number(stdout.trim().split(".")[0]) !== 10)
      throw new Error("Install pnpm 10.");
    return `pnpm ${stdout.trim()} is supported.`;
  });
  let config: FeedbaxConfig | undefined;
  await check("Configuration", async () => {
    config = await loadInstallationConfig(cwd, effectiveEnv);
    return "The typed src/feedbax.ts configuration is valid.";
  });
  await check("Cloudflare bindings", async () => {
    const wrangler = await readWranglerConfiguration(cwd);
    if (!wrangler.name) throw new Error("Set a Worker name in wrangler.jsonc.");
    for (const name of [
      "TRUSTED_SUBMISSIONS_RATE_LIMITER",
      "PORTAL_SUBMISSIONS_RATE_LIMITER",
    ])
      if (!wrangler.ratelimits?.some((binding) => binding.name === name))
        throw new Error(`Restore ${name} in wrangler.jsonc.`);
    return "Worker target and required rate-limit bindings are configured.";
  });
  if (config?.connected) {
    results.push({
      name: "Connected processing",
      status: config.connected.processing === "standard" ? "warn" : "pass",
      message:
        config.connected.processing === "standard"
          ? "Standard processing targets Workers Paid; full batches exceed Free invocation limits."
          : "Small processing caps each run at one followed Post, one email attempt, and five image cleanups. Verify CPU use and backlog on the target account.",
      repair:
        config.connected.processing === "standard"
          ? "Use Workers Paid for standard processing, or choose connected.processing: small."
          : undefined,
    });
    if (config.connected.email?.provider === "cloudflare")
      results.push({
        name: "Cloudflare Email Service plan",
        status: "warn",
        message:
          "Cloudflare Email Service requires Workers Paid for arbitrary recipients.",
        repair: "Verify Workers Paid or use Resend/custom delivery.",
      });
    await check("Connected identity", async () => {
      if (
        !effectiveEnv.IDENTITY_HANDOFF_SECRET ||
        effectiveEnv.IDENTITY_HANDOFF_SECRET.length < 32
      )
        throw new Error(
          "Configure IDENTITY_HANDOFF_SECRET with at least 32 random characters in .dev.vars and the Worker secret store.",
        );
      return "Signed identity handoff is configured; the secret is not printed.";
    });
    await check("Connected scheduled updates", async () => {
      const wrangler = await readWranglerConfiguration(cwd);
      if (!wrangler.triggers?.crons?.length)
        throw new Error(
          'Add triggers.crons: ["*/5 * * * *"] to wrangler.jsonc for following updates, email retries, and image cleanup.',
        );
      return "Scheduled Connected processing is configured.";
    });
    if (config.connected.email)
      await check("Notification email", async () => {
        const sender = config!.connected!.email!;
        const wrangler = await readWranglerConfiguration(cwd);
        if (sender.provider === "cloudflare") {
          if (
            !wrangler.send_email?.some((item) => item.name === "FEEDBAX_EMAIL")
          )
            throw new Error(
              "Add the FEEDBAX_EMAIL send_email binding and onboard the sender domain to Cloudflare Email Service.",
            );
        } else if (!effectiveEnv.EMAIL_PROVIDER_SECRET)
          throw new Error(
            "Store EMAIL_PROVIDER_SECRET in .dev.vars and the Worker secret store for the selected email provider.",
          );
        return `${sender.provider} email sending is configured. Domain verification and real delivery still need an acceptance check.`;
      });
    if (config.connected.images)
      await check("Participant images", async () => {
        const wrangler = await readWranglerConfiguration(cwd);
        if (
          !wrangler.r2_buckets?.some(
            (item) => item.binding === "FEEDBAX_IMAGES" && item.bucket_name,
          )
        )
          throw new Error(
            "Bind a dedicated private R2 bucket as FEEDBAX_IMAGES; keep r2.dev and custom-domain public access disabled.",
          );
        await execute(
          "pnpm",
          [
            "exec",
            "wrangler",
            "d1",
            "execute",
            "FEEDBAX_DB",
            "--remote",
            "--command",
            "SELECT id,subject,object_key,content_type,bytes,created_at,post_slug,comment_id FROM image_attachments LIMIT 0;",
          ],
          cwd,
        );
        return "Image binding and metadata schema are configured. Confirm the bucket has no public endpoint.";
      });
    await check("Connected D1 schema", async () => {
      const wrangler = await readWranglerConfiguration(cwd);
      const binding = wrangler.d1_databases?.find(
        (item) => item.binding === "FEEDBAX_DB",
      );
      if (!binding?.database_id)
        throw new Error(
          "Bind a dedicated D1 database as FEEDBAX_DB in wrangler.jsonc and apply all included D1 migrations.",
        );
      await execute(
        "pnpm",
        [
          "exec",
          "wrangler",
          "d1",
          "execute",
          "FEEDBAX_DB",
          "--remote",
          "--command",
          "SELECT subject, display_name FROM participants LIMIT 0; SELECT token_hash, expires_at FROM participant_sessions LIMIT 0; SELECT post_slug, subject FROM participant_votes LIMIT 0; SELECT comment_id, subject, display_name FROM comment_attribution LIMIT 0; SELECT nonce FROM identity_nonces LIMIT 0; SELECT post_slug,subject,followed_at FROM post_follows LIMIT 0; SELECT subject,email,email_enabled FROM participant_contacts LIMIT 0; SELECT id,event_id,read_at,email_state FROM participant_notifications LIMIT 0; SELECT post_slug,status,comment_cursor FROM post_observations LIMIT 0; SELECT id,post_slug,created_at FROM post_events LIMIT 0;",
        ],
        cwd,
      );
      return "The configured D1 schema is readable. No data was modified.";
    });
  }
  for (const name of [
    "NOTION_TOKEN",
    "FEEDBAX_API_KEY_HASH",
    "PARTICIPATION_SIGNING_SECRET",
  ])
    results.push(
      effectiveEnv[name]
        ? pass(name, `${name} is configured.`)
        : fail(
            name,
            `${name} is missing.`,
            `Add ${name} to .dev.vars locally and the Worker secret store in production.`,
          ),
    );
  if (!config?.turnstile.enabled)
    results.push({
      name: "Turnstile",
      status: "warn",
      message: "Turnstile is disabled; production spam protection is weaker.",
      repair: "Configure turnstile in src/feedbax.ts and TURNSTILE_SECRET_KEY.",
    });
  else
    results.push(
      effectiveEnv.TURNSTILE_SECRET_KEY
        ? pass("Turnstile", "The enabled Turnstile secret is present.")
        : fail(
            "Turnstile",
            "TURNSTILE_SECRET_KEY is missing.",
            "Configure the enabled Turnstile secret.",
          ),
    );

  if (config && effectiveEnv.NOTION_TOKEN) {
    const headers = {
      Authorization: `Bearer ${effectiveEnv.NOTION_TOKEN}`,
      "Notion-Version": "2026-03-11",
    };
    const get = async (path: string) => {
      const response = await request(`https://api.notion.com/v1/${path}`, {
        headers,
      });
      if (!response.ok)
        throw new Error(
          `Notion returned HTTP ${response.status}. Verify the connection permissions and configured identifiers.`,
        );
      return (await response.json()) as NotionSource;
    };
    await check("Notion Feedback schema", async () => {
      const source = await get(
        `data_sources/${encodeURIComponent(config!.notion.dataSourceId)}`,
      );
      validateProperties(source, config!.notion.properties, feedbackTypes);
      const byId = propertiesById(source);
      for (const [key, options] of Object.entries({
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
      })) {
        const property = byId.get(
          config!.notion.properties[
            key as keyof FeedbaxConfig["notion"]["properties"]
          ],
        );
        const available =
          property?.select?.options?.map(
            (option: { name: string }) => option.name,
          ) ?? [];
        const missing = options.filter((option) => !available.includes(option));
        if (missing.length)
          throw new Error(`Restore ${key} options: ${missing.join(", ")}.`);
      }
      const workflow = Object.entries(workflowTypes)
        .filter(([name, type]) => source.properties?.[name]?.type !== type)
        .map(([name]) => name);
      if (workflow.length)
        results.push({
          name: "Notion team workflow",
          status: "warn",
          message: `Missing private workflow properties: ${workflow.join(", ")}.`,
          repair:
            "Add these properties in Notion; public reads do not expose them.",
        });
      return "Configured stable property IDs, types, and workflow options are readable, including Vote Count.";
    });
    await check("Notion team views", async () => {
      const names = new Set<string>();
      let cursor: string | undefined;
      do {
        const list = await get(
          `views?database_id=${encodeURIComponent(config!.notion.databaseId)}${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ""}`,
        );
        if (!Array.isArray(list.results))
          throw new Error("Notion returned an invalid team-view list.");
        for (const view of list.results) {
          const detail = view.name
            ? view
            : await get(`views/${encodeURIComponent(view.id)}`);
          if (
            detail.name &&
            (!detail.data_source_id ||
              detail.data_source_id === config!.notion.dataSourceId)
          )
            names.add(detail.name);
        }
        cursor =
          list.has_more && list.next_cursor ? list.next_cursor : undefined;
      } while (cursor);
      const missing = [
        "Inbox",
        "Reviewing",
        "Prioritization",
        "Follow-up",
        "Roadmap",
        "Shipped",
      ].filter((name) => !names.has(name));
      if (missing.length)
        results.push({
          name: "Notion team views",
          status: "warn",
          message: `Missing default views: ${missing.join(", ")}.`,
          repair:
            "Restore the missing views in Notion or retain your intentionally customized team workflow.",
        });
      return missing.length
        ? "View access is readable; review the missing-view warning."
        : "All six default team views are readable.";
    });
    if (config.features.comments)
      await check("Notion Comments", async () => {
        await get(
          `comments?block_id=${encodeURIComponent(effectiveEnv.NOTION_COMMENT_CAPABILITY_PROBE_PAGE_ID ?? config!.notion.databaseId)}&page_size=1`,
        );
        return "Read comments is available. Insert comments was verified during setup; doctor makes no writes.";
      });
    if (config.features.changelog)
      await check("Notion Changelog schema", async () => {
        const source = await get(
          `data_sources/${encodeURIComponent(config!.changelog!.dataSourceId)}`,
        );
        validateProperties(
          source,
          config!.changelog!.properties,
          changelogTypes,
        );
        return "Configured Changelog property IDs and types are readable.";
      });
  }
  for (const [name, script] of [
    ["Type check", "type-check"],
    ["Tests", "test"],
    ["Production build", "build"],
  ])
    await check(name!, async () => {
      await execute("pnpm", [script!], cwd);
      return `${name} passed.`;
    });
  return results;
  async function check(name: string, operation: () => Promise<string>) {
    try {
      results.push(pass(name, await operation()));
    } catch (error) {
      results.push(
        fail(
          name,
          error instanceof Error ? error.message : `${name} failed.`,
          `Repair the reported ${name} problem and rerun doctor. No remote changes were made.`,
        ),
      );
    }
  }
}

const feedbackTypes = {
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
const changelogTypes = {
  title: "title",
  slug: "rich_text",
  date: "date",
  summary: "rich_text",
  body: "rich_text",
  labels: "multi_select",
  image: "files",
  published: "checkbox",
  createdAt: "created_time",
  updatedAt: "last_edited_time",
};
const workflowTypes = {
  Owner: "people",
  Priority: "select",
  "Strategic Theme": "multi_select",
  "Participant Segment": "multi_select",
  Impact: "select",
  Effort: "select",
  "Decision Note": "rich_text",
  "Needs Follow-up": "checkbox",
};
type NotionProperty = {
  id: string;
  type: string;
  select?: { options?: { name: string }[] };
};
type NotionSource = {
  properties?: Record<string, NotionProperty>;
  results?: { id: string; name?: string; data_source_id?: string }[];
  has_more?: boolean;
  next_cursor?: string;
  name?: string;
  data_source_id?: string;
};
function propertiesById(source: NotionSource) {
  return new Map(
    Object.values(source.properties ?? {}).map((property) => [
      property.id,
      property,
    ]),
  );
}
function validateProperties(
  source: NotionSource,
  ids: Record<string, string>,
  types: Record<string, string>,
) {
  const byId = propertiesById(source);
  for (const [key, type] of Object.entries(types))
    if (byId.get(ids[key]!)?.type !== type)
      throw new Error(
        `Restore ${key} with configured property ID ${ids[key]} and type ${type}, or update its stable ID in src/feedbax.ts.`,
      );
}
export const diagnosticsPassed = (items: Diagnostic[]) =>
  items.every((item) => item.status !== "fail");
const pass = (name: string, message: string): Diagnostic => ({
  name,
  status: "pass",
  message,
});
const fail = (name: string, message: string, repair: string): Diagnostic => ({
  name,
  status: "fail",
  message,
  repair,
});
async function runCommand(command: string, args: string[], cwd: string) {
  return new Promise<{ stdout: string }>((resolve, reject) => {
    let stdout = "";
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "inherit"],
    });
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      process.stdout.write(chunk);
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve({ stdout })
        : reject(new Error(`${command} ${args.join(" ")} failed.`)),
    );
  });
}
