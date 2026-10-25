import { spawn } from "node:child_process";
import { signIntegrationRequest } from "../../feedback/src/integration-auth";
import { createGitHubServiceAccess } from "../../feedback/src/github-service-client";
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
  options?: { privateOutput?: boolean },
) => Promise<{ stdout: string }>;

export async function diagnoseInstallation({
  cwd = process.cwd(),
  env = process.env,
  request = fetch,
  execute = runCommand,
  nodeVersion = process.versions.node,
  pairingBootstrap = false,
}: {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  request?: typeof fetch;
  execute?: Execute;
  nodeVersion?: string;
  pairingBootstrap?: boolean;
} = {}): Promise<Diagnostic[]> {
  const results: Diagnostic[] = [];
  const effectiveEnv = { ...(await readLocalEnvironment(cwd)), ...env };
  const [nodeMajor = 0, nodeMinor = 0] = nodeVersion.split(".").map(Number);
  results.push(
    nodeMajor >= 26 || (nodeMajor === 24 && nodeMinor >= 15)
      ? pass("Node.js", `Node ${nodeVersion} is supported.`)
      : fail(
          "Node.js",
          "Unsupported Node version.",
          "Install Node.js 24.15 or newer on the Node 24 LTS line, or Node 26+.",
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
  if (config?.history)
    await check("Observed history", async () => {
      const wrangler = await readWranglerConfiguration(cwd);
      if (
        !wrangler.d1_databases?.some(
          (binding) => binding.binding === "FEEDBAX_DB" && binding.database_id,
        )
      )
        throw Error(
          "Bind FEEDBAX_DB explicitly and apply all included migrations before enabling history.",
        );
      if (!wrangler.triggers?.crons?.length)
        throw Error(
          "Configure a scheduled trigger to check observed history between public reads.",
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
          "SELECT post_slug,revision,projection,checked_at,lease_until,lease_token FROM public_post_observations LIMIT 0; SELECT id,post_slug,revision,kind,status,message,observed_at FROM public_post_history LIMIT 0;",
        ],
        cwd,
      );
      return "Observed-history schema and timer are configured. The first public observation is the baseline; private history is never backfilled.";
    });
  if (config?.connected) {
    results.push({
      name: "Connected processing",
      status: config.connected.processing === "standard" ? "warn" : "pass",
      message:
        config.connected.processing === "standard"
          ? "Standard processing targets Workers Paid; full batches exceed Free invocation limits."
          : "Small processing enqueues one bounded job per timer tick. Its queue consumer observes one Post, attempts one email, and cleans up five images. Verify timer CPU and queue backlog on the target account.",
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
    if (config.connected.processing !== "standard")
      await check("Connected processing queue", async () => {
        const wrangler = await readWranglerConfiguration(cwd);
        const producers =
          wrangler.queues?.producers?.filter(
            (p) => p.binding === "FEEDBAX_UPDATES",
          ) ?? [];
        const producer = producers[0];
        const consumers =
          wrangler.queues?.consumers?.filter(
            (c) => c.queue === producer?.queue,
          ) ?? [];
        const consumer = consumers[0];
        if (
          producers.length !== 1 ||
          !producer?.queue ||
          consumers.length !== 1 ||
          !consumer
        )
          throw new Error(
            "Bind one existing Queue as FEEDBAX_UPDATES and configure its matching consumer in wrangler.jsonc; create it with pnpm exec wrangler queues create <queue-name>.",
          );
        if (
          consumer.max_batch_size !== 1 ||
          consumer.max_concurrency !== 1 ||
          (consumer.max_retries ?? 3) > 3 ||
          (consumer.retry_delay ?? 0) < 60
        )
          throw new Error(
            "Set the processing queue consumer max_batch_size=1, max_concurrency=1, max_retries=3, and retry_delay=60 to bound work and retry pressure.",
          );
        await execute(
          "pnpm",
          ["exec", "wrangler", "queues", "info", producer.queue],
          cwd,
        );
        return "The bounded processing queue exists. No messages were sent or changed.";
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
          "SELECT subject, display_name FROM participants LIMIT 0; SELECT token_hash, expires_at FROM participant_sessions LIMIT 0; SELECT post_slug, subject FROM participant_votes LIMIT 0; SELECT comment_id, subject, display_name FROM comment_attribution LIMIT 0; SELECT nonce FROM identity_nonces LIMIT 0; SELECT post_id,post_slug,subject FROM post_ownership LIMIT 0; SELECT post_slug,subject,followed_at,observed_status,ready,baseline_cursor,baseline_token,baseline_lease_until,baseline_checked_at FROM post_follows LIMIT 0; SELECT event_id FROM follow_comment_baselines LIMIT 0; SELECT subject,email,email_enabled FROM participant_contacts LIMIT 0; SELECT id,event_id,read_at,email_state FROM participant_notifications LIMIT 0; SELECT post_slug,status,comment_cursor FROM post_observations LIMIT 0; SELECT id,post_slug,created_at,status FROM post_events LIMIT 0;",
        ],
        cwd,
      );
      return "The configured D1 schema is readable. No data was modified.";
    });
  }
  for (const name of [
    ...(config?.provider === "github" ? [] : ["NOTION_TOKEN"]),
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

  if (config?.provider === "github") {
    const github = config.github;
    await check("GitHub D1 storage", async () => {
      const wrangler = await readWranglerConfiguration(cwd);
      if (
        !wrangler.d1_databases?.some(
          (binding) => binding.binding === "FEEDBAX_DB",
        )
      )
        throw new Error(
          "Provision the FEEDBAX_DB D1 binding and apply the included migrations.",
        );
      if (!wrangler.triggers?.crons?.length)
        throw new Error(
          "Configure the five-minute reconciliation cron in wrangler.jsonc.",
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
          "SELECT installation_id,post_id,state FROM github_posts LIMIT 0; SELECT comment_id FROM github_comments LIMIT 0; SELECT installation_id,revoked FROM integration_credentials LIMIT 0; SELECT event_id,attempts,next_attempt,lease_token,lease_until FROM integration_receipts LIMIT 0;",
        ],
        cwd,
      );
      return "GitHub mappings, private metadata, and delivery schema are readable. Identity remains independently configured.";
    });
    if (!pairingBootstrap)
      await check("GitHub Portal Binding", async () => {
        let secret = effectiveEnv.GITHUB_SERVICE_SECRET;
        if (!secret) {
          const captured = await execute(
            "pnpm",
            [
              "exec",
              "wrangler",
              "d1",
              "execute",
              "FEEDBAX_DB",
              "--remote",
              "--json",
              "--command",
              `SELECT portal_secret FROM integration_credentials WHERE installation_id='${github.installationId}' AND revoked=0;`,
            ],
            cwd,
            { privateOutput: true },
          );
          try {
            secret = JSON.parse(captured.stdout)[0]?.results?.[0]
              ?.portal_secret;
          } catch {
            /* Report the safe repair below. */
          }
        }
        if (!secret || secret.length < 32)
          throw new Error(
            "Pair this portal with its GitHub App service. No active Portal Binding credential is available.",
          );
        const statusResponse = await request(
          signIntegrationRequest({
            url: `${github.serviceUrl}/v1/status`,
            installationId: github.installationId,
            secret,
            body: "{}",
          }),
        );
        if (!statusResponse.ok)
          throw new Error(
            "GitHub Portal Binding is unavailable or revoked. Pair the Installation again.",
          );
        const status = (await statusResponse.json()) as {
          active?: boolean;
          lastDeliveryAt?: number;
          pending?: number;
          terminalFailures?: number;
          recoveryIntervalMs?: number;
        };
        if (!status.active)
          throw new Error("GitHub Portal Binding is revoked.");
        const interval = status.recoveryIntervalMs;
        const staleAfter =
          typeof interval === "number" &&
          Number.isFinite(interval) &&
          interval >= 300_000 &&
          interval <= 86400_000
            ? interval + 900_000
            : 900_000;
        if (
          !status.lastDeliveryAt ||
          Date.now() - status.lastDeliveryAt > staleAfter ||
          (status.terminalFailures ?? 0) > 0
        )
          results.push({
            name: "GitHub synchronization",
            status: "warn",
            message: `Reconciliation needs attention: ${status.pending ?? 0} pending; ${status.terminalFailures ?? 0} terminal failures.`,
            repair:
              "Verify service Queue delivery and recovery, portal cron processing, permissions, and their most recent successful delivery.",
          });
        const token = await createGitHubServiceAccess({
          config: github,
          secret,
          request,
        })();
        const repository = await request(
          `https://api.github.com/repos/${github.repository.owner}/${github.repository.name}`,
          {
            redirect: "manual",
            headers: {
              Authorization: `Bearer ${token}`,
              "User-Agent": "Feedbax",
              Accept: "application/vnd.github+json",
              "X-GitHub-Api-Version": "2026-03-10",
            },
          },
        );
        if (
          !repository.ok ||
          ((await repository.json()) as { id?: number }).id !==
            github.repository.id
        )
          throw new Error(
            "Repository access is unavailable or mismatched. Check the App installation permissions.",
          );
        return "Authenticated binding and repository access are valid. No provider data was modified.";
      });
  }
  if (config && config.provider !== "github" && effectiveEnv.NOTION_TOKEN) {
    const notion = config.notion;
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
        `data_sources/${encodeURIComponent(notion.dataSourceId)}`,
      );
      validateProperties(source, notion.properties, feedbackTypes);
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
          notion.properties[
            key as keyof NonNullable<FeedbaxConfig["notion"]>["properties"]
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
          `views?database_id=${encodeURIComponent(notion.databaseId)}${cursor ? `&start_cursor=${encodeURIComponent(cursor)}` : ""}`,
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
              detail.data_source_id === notion.dataSourceId)
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
          `comments?block_id=${encodeURIComponent(effectiveEnv.NOTION_COMMENT_CAPABILITY_PROBE_PAGE_ID ?? notion.databaseId)}&page_size=1`,
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
async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  options?: { privateOutput?: boolean },
) {
  return new Promise<{ stdout: string }>((resolve, reject) => {
    let stdout = "";
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", options?.privateOutput ? "pipe" : "inherit"],
    });
    child.stdout!.on("data", (chunk) => {
      stdout += String(chunk);
      if (!options?.privateOutput) process.stdout.write(chunk);
    });
    if (options?.privateOutput) child.stderr?.on("data", () => {});
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve({ stdout })
        : reject(new Error(`${command} ${args.join(" ")} failed.`)),
    );
  });
}
