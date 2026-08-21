#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createNotionFeedbackDataSource } from "../packages/feedback/src/index";

interface ManualInstallationOptions {
  token: string;
  parentPageId: string;
  envFile?: string;
  request?: typeof fetch;
}

const propertyEnvironmentNames = {
  title: "NOTION_FEEDBACK_TITLE_PROPERTY_ID",
  slug: "NOTION_FEEDBACK_SLUG_PROPERTY_ID",
  description: "NOTION_FEEDBACK_DESCRIPTION_PROPERTY_ID",
  type: "NOTION_FEEDBACK_TYPE_PROPERTY_ID",
  status: "NOTION_FEEDBACK_STATUS_PROPERTY_ID",
  published: "NOTION_FEEDBACK_PUBLISHED_PROPERTY_ID",
  submitterName: "NOTION_FEEDBACK_SUBMITTER_NAME_PROPERTY_ID",
  submitterEmail: "NOTION_FEEDBACK_SUBMITTER_EMAIL_PROPERTY_ID",
  source: "NOTION_FEEDBACK_SOURCE_PROPERTY_ID",
  externalId: "NOTION_FEEDBACK_EXTERNAL_ID_PROPERTY_ID",
  editTokenHash: "NOTION_FEEDBACK_EDIT_TOKEN_HASH_PROPERTY_ID",
  createdAt: "NOTION_FEEDBACK_CREATED_AT_PROPERTY_ID",
  updatedAt: "NOTION_FEEDBACK_UPDATED_AT_PROPERTY_ID",
} as const;

export async function provisionManualInstallation({
  token,
  parentPageId,
  envFile = resolve("apps/portal/.dev.vars"),
  request = fetch,
}: ManualInstallationOptions) {
  assertSingleLine("NOTION_TOKEN", token);
  assertSingleLine("Notion parent page ID", parentPageId);

  const configuration = await createNotionFeedbackDataSource({
    token,
    parentPageId,
    request,
  });
  const apiKey = randomBytes(32).toString("base64url");
  const apiKeyHash = createHash("sha256").update(apiKey).digest("base64url");
  const values: Record<string, string> = {
    NOTION_TOKEN: token,
    NOTION_FEEDBACK_DATA_SOURCE_ID: configuration.dataSourceId,
    FEEDBAX_API_KEY_HASH: apiKeyHash,
    FEEDBAX_SMOKE_API_KEY: apiKey,
  };

  for (const [property, environmentName] of Object.entries(
    propertyEnvironmentNames,
  )) {
    values[environmentName] =
      configuration.propertyIds[
        property as keyof typeof configuration.propertyIds
      ];
  }

  await upsertEnvironmentFile(envFile, values);
  await chmod(envFile, 0o600);

  console.log(`Created Notion database ${configuration.databaseId}.`);
  console.log(`Configured Feedback Data Source ${configuration.dataSourceId}.`);
  console.log(`Wrote local secrets and property IDs to ${envFile}.`);
  console.log(
    "The plaintext smoke API key is stored only as FEEDBAX_SMOKE_API_KEY in the ignored local file.",
  );

  return {
    databaseId: configuration.databaseId,
    dataSourceId: configuration.dataSourceId,
    propertyIds: configuration.propertyIds,
    envFile,
  };
}

async function upsertEnvironmentFile(
  envFile: string,
  values: Record<string, string>,
): Promise<void> {
  let existing = "";
  try {
    existing = await readFile(envFile, "utf8");
  } catch (error) {
    if (!(
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    )) {
      throw error;
    }
  }

  const replacedKeys = new Set(Object.keys(values));
  const retained = existing
    .split("\n")
    .filter((line) => {
      const separator = line.indexOf("=");
      return separator < 0 || !replacedKeys.has(line.slice(0, separator));
    })
    .filter(Boolean);
  const additions = Object.entries(values).map(([key, value]) => {
    assertSingleLine(key, value);
    return `${key}=${value}`;
  });

  await writeFile(envFile, [...retained, ...additions, ""].join("\n"), {
    mode: 0o600,
  });
}

function assertSingleLine(label: string, value: string): void {
  if (!value.trim() || /[\r\n]/u.test(value)) {
    throw new Error(`${label} must be a non-empty single-line value.`);
  }
}

async function main(): Promise<void> {
  const parentPageId = process.argv[2]?.trim();
  const token = process.env.NOTION_TOKEN?.trim();
  if (!parentPageId || !token) {
    throw new Error(
      "Usage: NOTION_TOKEN=<secret> pnpm manual:setup:notion <parent-page-id>",
    );
  }

  await provisionManualInstallation({ token, parentPageId });
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  main().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Manual setup failed.",
    );
    process.exitCode = 1;
  });
}
