#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import { chmod, copyFile, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createNotionChangelogDataSource } from "../packages/changelog/src/index";
import {
  createNotionFeedbackDataSource,
  type FeedbackPropertyIds,
  type PostStatus,
} from "../packages/feedback/src/index";

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
  voteCount: "NOTION_FEEDBACK_VOTE_COUNT_PROPERTY_ID",
  submitterName: "NOTION_FEEDBACK_SUBMITTER_NAME_PROPERTY_ID",
  submitterEmail: "NOTION_FEEDBACK_SUBMITTER_EMAIL_PROPERTY_ID",
  source: "NOTION_FEEDBACK_SOURCE_PROPERTY_ID",
  externalId: "NOTION_FEEDBACK_EXTERNAL_ID_PROPERTY_ID",
  editTokenHash: "NOTION_FEEDBACK_EDIT_TOKEN_HASH_PROPERTY_ID",
  createdAt: "NOTION_FEEDBACK_CREATED_AT_PROPERTY_ID",
  updatedAt: "NOTION_FEEDBACK_UPDATED_AT_PROPERTY_ID",
} as const;

const changelogPropertyEnvironmentNames = {
  title: "NOTION_CHANGELOG_TITLE_PROPERTY_ID",
  slug: "NOTION_CHANGELOG_SLUG_PROPERTY_ID",
  date: "NOTION_CHANGELOG_DATE_PROPERTY_ID",
  summary: "NOTION_CHANGELOG_SUMMARY_PROPERTY_ID",
  body: "NOTION_CHANGELOG_BODY_PROPERTY_ID",
  labels: "NOTION_CHANGELOG_LABELS_PROPERTY_ID",
  image: "NOTION_CHANGELOG_IMAGE_PROPERTY_ID",
  published: "NOTION_CHANGELOG_PUBLISHED_PROPERTY_ID",
  createdAt: "NOTION_CHANGELOG_CREATED_AT_PROPERTY_ID",
  updatedAt: "NOTION_CHANGELOG_UPDATED_AT_PROPERTY_ID",
} as const;

export const feedbaxRoadmap = [
  {
    title: "Prove the production Notion and Cloudflare installation",
    slug: "prove-production-notion-cloudflare-installation",
    status: "In Progress",
    description:
      "Connect the canonical Notion data sources to the production Worker and verify the complete public participation loop.",
  },
  {
    title: "Ship the interactive create-feedbax generator",
    slug: "ship-interactive-create-feedbax-generator",
    status: "Planned",
    description:
      "Turn the proven installation workflow into a guided project generator for new Product Teams.",
  },
  {
    title: "Add feedbax doctor diagnostics and API-key rotation",
    slug: "add-feedbax-doctor-and-api-key-rotation",
    status: "Planned",
    description:
      "Diagnose configuration problems safely and support deliberate trusted-submission credential rotation.",
  },
  {
    title: "Publish the Feedbax documentation application",
    slug: "publish-feedbax-documentation-application",
    status: "Planned",
    description:
      "Deploy installation, operation, customization, and recovery guidance on Cloudflare.",
  },
  {
    title: "Dogfood Feedbax with its own public portal",
    slug: "dogfood-feedbax-public-portal",
    status: "Planned",
    description:
      "Use this Installation for Feedbax product feedback and improve it from production experience.",
  },
  {
    title: "Run design-partner testing and release hardening",
    slug: "run-design-partner-testing-and-release-hardening",
    status: "Planned",
    description:
      "Validate the Notion-native workflow with small Product Teams before the final 0.2.0 release.",
  },
  {
    title: "Notion-backed public feedback and roadmap",
    slug: "notion-backed-public-feedback-and-roadmap",
    status: "Shipped",
    description:
      "Browse published Posts and follow Planned, In Progress, and Shipped work from Notion.",
  },
  {
    title: "Anonymous submissions and browser-held draft editing",
    slug: "anonymous-submissions-and-browser-draft-editing",
    status: "Shipped",
    description:
      "Submit moderated feedback and revise a New unpublished draft from its originating browser.",
  },
  {
    title: "Best-effort voting and native Notion comments",
    slug: "best-effort-voting-and-native-notion-comments",
    status: "Shipped",
    description:
      "Let Participants vote and join Comment Threads while the Product Team works in Notion.",
  },
  {
    title: "Notion-backed changelog",
    slug: "notion-backed-changelog",
    status: "Shipped",
    description:
      "Publish product updates from a focused sibling Changelog Data Source.",
  },
  {
    title: "Trusted feedback submission API",
    slug: "trusted-feedback-submission-api",
    status: "Shipped",
    description:
      "Accept bounded, authenticated, idempotent Post submissions from another SaaS product.",
  },
  {
    title: "Cloudflare Worker portal and public-read caching",
    slug: "cloudflare-worker-portal-and-public-read-caching",
    status: "Shipped",
    description:
      "Serve the standalone portal from Cloudflare with safe cached public projections.",
  },
] as const satisfies readonly {
  title: string;
  slug: string;
  status: Extract<PostStatus, "Planned" | "In Progress" | "Shipped">;
  description: string;
}[];

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
  const changelog = await createNotionChangelogDataSource({
    token,
    databaseId: configuration.databaseId,
    request,
  });
  const seededPageIds = await seedFeedbaxRoadmap({
    token,
    dataSourceId: configuration.dataSourceId,
    propertyIds: configuration.propertyIds,
    request,
  });
  const apiKey = randomBytes(32).toString("base64url");
  const apiKeyHash = createHash("sha256").update(apiKey).digest("base64url");
  const participationSigningSecret = randomBytes(32).toString("base64url");
  const values: Record<string, string> = {
    NOTION_TOKEN: token,
    NOTION_FEEDBACK_DATABASE_ID: configuration.databaseId,
    NOTION_FEEDBACK_DATA_SOURCE_ID: configuration.dataSourceId,
    NOTION_CHANGELOG_DATABASE_ID: changelog.databaseId,
    NOTION_CHANGELOG_DATA_SOURCE_ID: changelog.dataSourceId,
    NOTION_COMMENT_CAPABILITY_PROBE_PAGE_ID: seededPageIds[0]!,
    FEEDBAX_API_KEY_HASH: apiKeyHash,
    FEEDBAX_SMOKE_API_KEY: apiKey,
    PARTICIPATION_SIGNING_SECRET: participationSigningSecret,
  };

  for (const [property, environmentName] of Object.entries(
    propertyEnvironmentNames,
  )) {
    values[environmentName] =
      configuration.propertyIds[
        property as keyof typeof configuration.propertyIds
      ];
  }

  for (const [property, environmentName] of Object.entries(
    changelogPropertyEnvironmentNames,
  )) {
    values[environmentName] =
      changelog.propertyIds[property as keyof typeof changelog.propertyIds];
  }

  const backupFile = await backupEnvironmentFile(envFile);
  await upsertEnvironmentFile(envFile, values);
  await chmod(envFile, 0o600);

  console.log(`Created Notion database ${configuration.databaseId}.`);
  console.log(`Configured Feedback Data Source ${configuration.dataSourceId}.`);
  console.log(`Configured Changelog Data Source ${changelog.dataSourceId}.`);
  console.log(`Published ${seededPageIds.length} Feedbax roadmap Posts.`);
  console.log(`Wrote local secrets and property IDs to ${envFile}.`);
  if (backupFile)
    console.log(`Preserved the previous configuration in ${backupFile}.`);
  console.log(
    "The plaintext smoke API key is stored only as FEEDBAX_SMOKE_API_KEY in the ignored local file.",
  );

  return {
    databaseId: configuration.databaseId,
    dataSourceId: configuration.dataSourceId,
    propertyIds: configuration.propertyIds,
    changelog,
    seededPageIds,
    backupFile,
    envFile,
  };
}

async function seedFeedbaxRoadmap({
  token,
  dataSourceId,
  propertyIds,
  request,
}: {
  token: string;
  dataSourceId: string;
  propertyIds: FeedbackPropertyIds;
  request: typeof fetch;
}): Promise<string[]> {
  const pageIds: string[] = [];
  for (const post of feedbaxRoadmap) {
    const response = await request("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Notion-Version": "2026-03-11",
      },
      body: JSON.stringify({
        parent: { type: "data_source_id", data_source_id: dataSourceId },
        properties: {
          [propertyIds.title]: {
            type: "title",
            title: [{ type: "text", text: { content: post.title } }],
          },
          [propertyIds.slug]: {
            type: "rich_text",
            rich_text: [{ type: "text", text: { content: post.slug } }],
          },
          [propertyIds.description]: {
            type: "rich_text",
            rich_text: [{ type: "text", text: { content: post.description } }],
          },
          [propertyIds.type]: {
            type: "select",
            select: { name: "Feature Request" },
          },
          [propertyIds.status]: {
            type: "select",
            select: { name: post.status },
          },
          [propertyIds.published]: { type: "checkbox", checkbox: true },
          [propertyIds.voteCount]: { type: "number", number: 0 },
          [propertyIds.source]: { type: "select", select: { name: "Team" } },
          [propertyIds.externalId]: {
            type: "rich_text",
            rich_text: [
              {
                type: "text",
                text: { content: `feedbax-roadmap:${post.slug}` },
              },
            ],
          },
        },
      }),
    });
    if (!response.ok) {
      throw new Error(
        `Notion roadmap seed failed for "${post.title}" (${response.status}).`,
      );
    }
    const value: unknown = await response.json();
    const id =
      value && typeof value === "object" ? Reflect.get(value, "id") : undefined;
    if (typeof id !== "string") {
      throw new Error(`Notion did not return the seeded Post "${post.title}".`);
    }
    pageIds.push(id);
  }
  return pageIds;
}

async function backupEnvironmentFile(
  envFile: string,
): Promise<string | undefined> {
  try {
    await readFile(envFile, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  const backupFile = `${envFile}.before-reconnect`;
  await copyFile(envFile, backupFile);
  await chmod(backupFile, 0o600);
  return backupFile;
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
