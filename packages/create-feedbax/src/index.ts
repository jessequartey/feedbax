import type { PortalFeatures } from "@feedbax/config";
import {
  validateNotionFeedbackDataSource,
  type FeedbackDataSourceConfiguration,
} from "@feedbax/feedback";
import {
  createNotionChangelogDataSource,
  validateNotionChangelogDataSource,
  type ChangelogDataSourceConfiguration,
  type ChangelogPropertyIds,
} from "@feedbax/changelog";

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
