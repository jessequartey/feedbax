import type { PortalFeatures } from "@feedbax/config";
import { createHash, randomBytes } from "node:crypto";
import { readdir, writeFile } from "node:fs/promises";
import { defineFeedbax } from "@feedbax/config";
import { join } from "node:path";
import { copyPackagedTemplate } from "./template";
export {
  assembleFlatTemplate,
  copyPackagedTemplate,
  templateChecksum,
  verifyPackagedTemplate,
} from "./template";
import {
  createNotionFeedbackDataSource,
  createFeedbackWorkflowViews,
  validateNotionFeedbackDataSource,
  type FeedbackDataSourceConfiguration,
} from "@feedbax/feedback";
import {
  createNotionChangelogDataSource,
  validateNotionChangelogDataSource,
  type ChangelogDataSourceConfiguration,
  type ChangelogPropertyIds,
} from "@feedbax/changelog";

export type FeedbackStorageSelection =
  | { kind: "create"; parentPageId: string }
  | { kind: "existing"; configuration: FeedbackDataSourceConfiguration };

export async function provisionGuidedInstallation({
  destination,
  product,
  themePreset,
  features,
  feedbackSelection,
  changelogSelection,
  notionToken,
  turnstile,
  preview,
  request = fetch,
}: {
  destination: string;
  product: { name: string; description: string; siteUrl?: string };
  themePreset: string;
  features: PortalFeatures;
  feedbackSelection: FeedbackStorageSelection;
  changelogSelection?: ChangelogStorageSelection;
  notionToken: string;
  turnstile: { siteKey?: string; secretKey?: string };
  preview(message: string): Promise<boolean>;
  request?: typeof fetch;
}) {
  try {
    if ((await readdir(destination)).length)
      throw new Error(
        `Refusing to generate into non-empty destination: ${destination}`,
      );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const approved = await preview(
    feedbackSelection.kind === "create"
      ? `Create the canonical Feedback Data Source inside Notion page ${feedbackSelection.parentPageId}.`
      : `Validate existing Feedback Data Source ${feedbackSelection.configuration.dataSourceId} without changing it.`,
  );
  if (!approved)
    throw new Error(
      "Feedback setup was not approved. No local files were created.",
    );
  const feedback =
    feedbackSelection.kind === "create"
      ? await createNotionFeedbackDataSource({
          token: notionToken,
          parentPageId: feedbackSelection.parentPageId,
          request,
        })
      : await validateNotionFeedbackDataSource({
          token: notionToken,
          ...feedbackSelection.configuration,
          request,
        });
  if (feedbackSelection.kind === "create") {
    if (
      !(await preview(
        "Create six Notion team views: Inbox, Reviewing, Prioritization, Follow-up, Roadmap, and Shipped.",
      ))
    )
      throw new Error("Workflow view creation was not approved.");
    await createFeedbackWorkflowViews({
      token: notionToken,
      ...feedback,
      request,
    });
  }
  await verifySelectedCommentCapabilities(features, {
    token: notionToken,
    pageId:
      feedbackSelection.kind === "create"
        ? feedbackSelection.parentPageId
        : feedback.databaseId,
    request,
    command: "setup",
  });
  const changelog = await configureChangelogStorage({
    features,
    selection:
      changelogSelection ??
      (features.changelog
        ? { kind: "create", databaseId: feedback.databaseId }
        : undefined),
    token: notionToken,
    request,
    preview,
  });

  await copyPackagedTemplate(destination);
  const apiKey = randomBytes(32).toString("base64url");
  const signingSecret = randomBytes(32).toString("base64url");
  const values: Record<string, string> = {
    NOTION_TOKEN: notionToken,
    NOTION_FEEDBACK_DATABASE_ID: feedback.databaseId,
    NOTION_FEEDBACK_DATA_SOURCE_ID: feedback.dataSourceId,
    ...prefixProperties("NOTION_FEEDBACK", feedback.propertyIds),
    FEEDBAX_API_KEY_HASH: createHash("sha256")
      .update(apiKey)
      .digest("base64url"),
    PARTICIPATION_SIGNING_SECRET: signingSecret,
    FEEDBAX_VOTING_ENABLED: String(features.voting),
    FEEDBAX_COMMENTS_ENABLED: String(features.comments),
    FEEDBAX_CHANGELOG_ENABLED: String(features.changelog),
    ...(turnstile.siteKey
      ? { VITE_TURNSTILE_SITE_KEY: turnstile.siteKey }
      : {}),
    ...(turnstile.secretKey
      ? { TURNSTILE_SECRET_KEY: turnstile.secretKey }
      : {}),
    ...(changelog
      ? {
          NOTION_CHANGELOG_DATABASE_ID: changelog.databaseId,
          NOTION_CHANGELOG_DATA_SOURCE_ID: changelog.dataSourceId,
          ...prefixProperties("NOTION_CHANGELOG", changelog.propertyIds),
        }
      : {}),
  };
  await writeFile(
    join(destination, ".dev.vars"),
    Object.entries(values)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
  const configuration = defineFeedbax({
    product: { ...product, logo: "/feedbax-mark.svg" },
    theme: { preset: themePreset },
    notion: {
      databaseId: feedback.databaseId,
      dataSourceId: feedback.dataSourceId,
      properties: feedback.propertyIds,
    },
    ...(changelog
      ? {
          changelog: {
            databaseId: changelog.databaseId,
            dataSourceId: changelog.dataSourceId,
            properties: changelog.propertyIds,
          },
        }
      : {}),
    features,
    submissions: {
      moderation: "required",
      maxTitleLength: 160,
      maxDescriptionLength: 5000,
    },
    turnstile: {
      enabled: Boolean(turnstile.siteKey),
      ...(turnstile.siteKey ? { siteKey: turnstile.siteKey } : {}),
    },
  });
  await writeFile(
    join(destination, "src/feedbax.ts"),
    `import { defineFeedbax } from "@feedbax/config";\n\nexport default defineFeedbax(${JSON.stringify(configuration, null, 2)});\n`,
  );
  const probePage =
    feedbackSelection.kind === "create"
      ? feedbackSelection.parentPageId
      : feedback.databaseId;
  await writeFile(
    join(destination, ".dev.vars"),
    `NOTION_COMMENT_CAPABILITY_PROBE_PAGE_ID=${JSON.stringify(probePage)}\n`,
    { flag: "a", mode: 0o600 },
  );
  return { apiKey, feedback, changelog };
}

function prefixProperties(prefix: string, properties: object) {
  return Object.fromEntries(
    (Object.entries(properties) as [string, string][]).map(([key, value]) => [
      `${prefix}_${key.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}_PROPERTY_ID`,
      value,
    ]),
  );
}

export const featureChoices = [
  { key: "voting", label: "Voting", initialValue: true },
  { key: "comments", label: "Comments", initialValue: true },
  { key: "changelog", label: "Changelog", initialValue: true },
] as const;

export type CreatorPrompter = {
  confirm(input: { message: string; initialValue: boolean }): Promise<boolean>;
};

export async function collectFeatureSelection(
  prompter: CreatorPrompter,
): Promise<PortalFeatures> {
  const selections: [keyof PortalFeatures, boolean][] = [];
  for (const { key, label, initialValue } of featureChoices) {
    selections.push([
      key,
      await prompter.confirm({
        message: `Enable ${label}?`,
        initialValue,
      }),
    ]);
  }
  return Object.fromEntries(selections) as PortalFeatures;
}

export function renderFeatureConfiguration(features: PortalFeatures): string {
  return `features: {
    voting: ${features.voting},
    comments: ${features.comments},
    changelog: ${features.changelog},
  },`;
}

export function renderChangelogConfiguration(
  configuration: ChangelogDataSourceConfiguration,
): string {
  const properties = Object.entries(configuration.propertyIds)
    .map(([key, value]) => `      ${key}: ${JSON.stringify(value)},`)
    .join("\n");
  return `changelog: {
    databaseId: ${JSON.stringify(configuration.databaseId)},
    dataSourceId: ${JSON.stringify(configuration.dataSourceId)},
    propertyIds: {
${properties}
    },
  },`;
}

export interface NotionCommentCapabilities {
  readComments: boolean;
  insertComments: boolean;
}

export async function verifySelectedCommentCapabilities(
  features: PortalFeatures,
  {
    token,
    pageId,
    request = fetch,
    command = "setup",
  }: {
    token: string;
    pageId: string;
    request?: typeof fetch;
    command?: "setup" | "doctor";
  },
): Promise<void> {
  if (!features.comments) return;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Notion-Version": "2026-03-11",
  };
  const readResponse = await request(
    `https://api.notion.com/v1/comments?block_id=${encodeURIComponent(pageId)}&page_size=1`,
    { headers },
  );
  if (!readResponse.ok) {
    if (readResponse.status === 403)
      assertEnabledCommentCapabilities({
        commentsEnabled: true,
        capabilities: { readComments: false, insertComments: true },
        command,
      });
    throw new Error(
      `Notion Comment read check failed (HTTP ${readResponse.status}). Verify a shared page ID and connection access.`,
    );
  }
  if (command === "doctor") {
    assertEnabledCommentCapabilities({
      commentsEnabled: true,
      capabilities: {
        readComments: readResponse.status !== 403,
        // Setup proves Insert comments before enabling the capability. Doctor
        // deliberately avoids a write-method probe and verifies the live read path.
        insertComments: true,
      },
      command,
    });
    return;
  }
  const insertResponse = await request("https://api.notion.com/v1/comments", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: "{}",
  });
  if (insertResponse.status !== 400 && insertResponse.status !== 403)
    throw new Error(
      `Notion Comment insert capability check failed (HTTP ${insertResponse.status}).`,
    );
  const capabilities = {
    readComments: readResponse.status !== 403,
    insertComments: insertResponse.status !== 403,
  };
  assertEnabledCommentCapabilities({
    commentsEnabled: true,
    capabilities,
    command,
  });
}

export function assertEnabledCommentCapabilities({
  commentsEnabled,
  capabilities,
  command = "setup",
}: {
  commentsEnabled: boolean;
  capabilities: NotionCommentCapabilities;
  command?: "setup" | "doctor";
}): void {
  if (!commentsEnabled) return;
  const missing = [
    ...(capabilities.readComments ? [] : ["Read comments"]),
    ...(capabilities.insertComments ? [] : ["Insert comments"]),
  ];
  if (missing.length === 0) return;
  const retry =
    command === "doctor"
      ? "rerun doctor. No changes were made."
      : "retry setup.";
  throw new Error(
    `Enable ${missing.join(" and ")} in the Notion connection settings, then ${retry}`,
  );
}

export type ChangelogStorageSelection =
  | { kind: "create"; databaseId: string }
  | {
      kind: "existing";
      dataSourceId: string;
      propertyIds: ChangelogPropertyIds;
    };

export async function configureChangelogStorage({
  features,
  selection,
  token,
  request = fetch,
  preview,
}: {
  features: PortalFeatures;
  selection?: ChangelogStorageSelection;
  token: string;
  request?: typeof fetch;
  preview(message: string): Promise<boolean>;
}): Promise<ChangelogDataSourceConfiguration | undefined> {
  if (!features.changelog) return;
  if (!selection) {
    throw new Error(
      "Choose an existing compatible Changelog Data Source or create one beside Feedback.",
    );
  }
  if (selection.kind === "existing") {
    return validateNotionChangelogDataSource({
      token,
      dataSourceId: selection.dataSourceId,
      propertyIds: selection.propertyIds,
      request,
    });
  }
  const approved = await preview(
    `Create an empty Changelog Data Source beside Feedback in Feedbax Database ${selection.databaseId}. No sample entries will be published.`,
  );
  if (!approved) throw new Error("Changelog creation was not approved.");
  return createNotionChangelogDataSource({
    token,
    databaseId: selection.databaseId,
    request,
  });
}

export async function doctorChangelogStorage({
  enabled,
  configuration,
  token,
  request = fetch,
}: {
  enabled: boolean;
  configuration?: ChangelogDataSourceConfiguration;
  token: string;
  request?: typeof fetch;
}): Promise<void> {
  if (!enabled) return;
  if (!configuration) {
    throw new Error(
      "Changelog is enabled without identifiers and property mappings. Create or select a compatible Changelog Data Source, configure it, then rerun doctor. No changes were made.",
    );
  }
  await validateNotionChangelogDataSource({
    token,
    dataSourceId: configuration.dataSourceId,
    propertyIds: configuration.propertyIds,
    request,
  });
}

export async function doctorInstallation({
  features,
  feedback,
  changelog,
  commentProbePageId,
  token,
  request = fetch,
}: {
  features: PortalFeatures;
  feedback: Omit<FeedbackDataSourceConfiguration, "databaseId">;
  changelog?: ChangelogDataSourceConfiguration;
  commentProbePageId?: string;
  token: string;
  request?: typeof fetch;
}): Promise<void> {
  await validateNotionFeedbackDataSource({ token, ...feedback, request });
  if (features.comments) {
    if (!commentProbePageId) {
      throw new Error(
        "Comments are enabled but no Comment capability probe page is configured. Configure one, then rerun doctor. No changes were made.",
      );
    }
    await verifySelectedCommentCapabilities(features, {
      token,
      pageId: commentProbePageId,
      request,
      command: "doctor",
    });
  }
  await doctorChangelogStorage({
    enabled: features.changelog,
    configuration: changelog,
    token,
    request,
  });
}
