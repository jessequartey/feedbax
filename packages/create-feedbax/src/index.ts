import type { PortalFeatures } from "@feedbax/config";

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
  const [readResponse, insertResponse] = await Promise.all([
    request(
      `https://api.notion.com/v1/comments?block_id=${encodeURIComponent(pageId)}&page_size=1`,
      { headers },
    ),
    request("https://api.notion.com/v1/comments", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: "{}",
    }),
  ]);
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
