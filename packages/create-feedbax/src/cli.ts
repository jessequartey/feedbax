#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import {
  collectFeatureSelection,
  configureChangelogStorage,
  doctorInstallation,
  renderChangelogConfiguration,
  renderFeatureConfiguration,
  type CreatorPrompter,
  verifySelectedCommentCapabilities,
} from "./index.ts";

const terminal = createInterface({ input: stdin, output: stdout });

try {
  stdout.write("Configure optional Feedbax capabilities\n\n");
  const prompter: CreatorPrompter = {
    confirm: async ({ message, initialValue }) => {
      const hint = initialValue ? "Y/n" : "y/N";
      const answer = (await terminal.question(`${message} (${hint}) `))
        .trim()
        .toLowerCase();
      if (!answer) return initialValue;
      return answer === "y" || answer === "yes";
    },
  };
  const command = process.argv.includes("doctor") ? "doctor" : "setup";
  const features =
    command === "doctor"
      ? {
          voting: process.env.FEEDBAX_VOTING_ENABLED !== "false",
          comments: process.env.FEEDBAX_COMMENTS_ENABLED !== "false",
          changelog: process.env.FEEDBAX_CHANGELOG_ENABLED !== "false",
        }
      : await collectFeatureSelection(prompter);
  if (features.comments && command === "setup") {
    const token = process.env.NOTION_TOKEN;
    const pageId = process.env.NOTION_COMMENT_CAPABILITY_PROBE_PAGE_ID;
    if (!token || !pageId)
      throw new Error(
        "Comment capability verification requires NOTION_TOKEN and NOTION_COMMENT_CAPABILITY_PROBE_PAGE_ID.",
      );
    await verifySelectedCommentCapabilities(features, {
      token,
      pageId,
      command,
    });
  }
  if (command === "doctor") {
    await doctorInstallation({
      features,
      feedback: {
        dataSourceId: environmentValue("NOTION_FEEDBACK_DATA_SOURCE_ID"),
        propertyIds: feedbackPropertyIdsFromEnvironment(),
      },
      changelog: features.changelog
        ? {
            databaseId: environmentValue("NOTION_CHANGELOG_DATABASE_ID"),
            dataSourceId: environmentValue("NOTION_CHANGELOG_DATA_SOURCE_ID"),
            propertyIds: changelogPropertyIdsFromEnvironment("doctor"),
          }
        : undefined,
      commentProbePageId: features.comments
        ? environmentValue("NOTION_COMMENT_CAPABILITY_PROBE_PAGE_ID")
        : undefined,
      token: environmentValue("NOTION_TOKEN"),
    });
    stdout.write(
      "\nThe canonical Feedback schema and every enabled optional capability are configured. No changes were made.\n",
    );
    process.exitCode = 0;
  } else {
    const changelog = features.changelog
      ? await configureChangelogStorage({
          features,
          selection: (await prompter.confirm({
            message: "Use an existing compatible Changelog Data Source?",
            initialValue: false,
          }))
            ? {
                kind: "existing",
                dataSourceId: environmentValue(
                  "NOTION_CHANGELOG_DATA_SOURCE_ID",
                  "setup",
                ),
                propertyIds: changelogPropertyIdsFromEnvironment("setup"),
              }
            : {
                kind: "create",
                databaseId: environmentValue(
                  "NOTION_FEEDBACK_DATABASE_ID",
                  "setup",
                ),
              },
          token: environmentValue("NOTION_TOKEN", "setup"),
          preview: (message) =>
            prompter.confirm({ message, initialValue: false }),
        })
      : undefined;
    stdout.write(
      `\nAdd this to feedbax.ts:\n\n${renderFeatureConfiguration(features)}${changelog ? `\n${renderChangelogConfiguration(changelog)}` : ""}\n`,
    );
  }
} finally {
  terminal.close();
}

function feedbackPropertyIdsFromEnvironment() {
  return {
    title: environmentValue("NOTION_FEEDBACK_TITLE_PROPERTY_ID"),
    slug: environmentValue("NOTION_FEEDBACK_SLUG_PROPERTY_ID"),
    description: environmentValue("NOTION_FEEDBACK_DESCRIPTION_PROPERTY_ID"),
    type: environmentValue("NOTION_FEEDBACK_TYPE_PROPERTY_ID"),
    status: environmentValue("NOTION_FEEDBACK_STATUS_PROPERTY_ID"),
    published: environmentValue("NOTION_FEEDBACK_PUBLISHED_PROPERTY_ID"),
    voteCount: environmentValue("NOTION_FEEDBACK_VOTE_COUNT_PROPERTY_ID"),
    submitterName: environmentValue(
      "NOTION_FEEDBACK_SUBMITTER_NAME_PROPERTY_ID",
    ),
    submitterEmail: environmentValue(
      "NOTION_FEEDBACK_SUBMITTER_EMAIL_PROPERTY_ID",
    ),
    source: environmentValue("NOTION_FEEDBACK_SOURCE_PROPERTY_ID"),
    externalId: environmentValue("NOTION_FEEDBACK_EXTERNAL_ID_PROPERTY_ID"),
    editTokenHash: environmentValue(
      "NOTION_FEEDBACK_EDIT_TOKEN_HASH_PROPERTY_ID",
    ),
    createdAt: environmentValue("NOTION_FEEDBACK_CREATED_AT_PROPERTY_ID"),
    updatedAt: environmentValue("NOTION_FEEDBACK_UPDATED_AT_PROPERTY_ID"),
  };
}

function environmentValue(
  name: string,
  command: "setup" | "doctor" = "doctor",
): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(
      `${name} is required for ${command}. No changes were made.`,
    );
  }
  return value;
}

function changelogPropertyIdsFromEnvironment(command: "setup" | "doctor") {
  return {
    title: environmentValue("NOTION_CHANGELOG_TITLE_PROPERTY_ID", command),
    slug: environmentValue("NOTION_CHANGELOG_SLUG_PROPERTY_ID", command),
    date: environmentValue("NOTION_CHANGELOG_DATE_PROPERTY_ID", command),
    summary: environmentValue("NOTION_CHANGELOG_SUMMARY_PROPERTY_ID", command),
    body: environmentValue("NOTION_CHANGELOG_BODY_PROPERTY_ID", command),
    labels: environmentValue("NOTION_CHANGELOG_LABELS_PROPERTY_ID", command),
    image: environmentValue("NOTION_CHANGELOG_IMAGE_PROPERTY_ID", command),
    published: environmentValue(
      "NOTION_CHANGELOG_PUBLISHED_PROPERTY_ID",
      command,
    ),
    createdAt: environmentValue(
      "NOTION_CHANGELOG_CREATED_AT_PROPERTY_ID",
      command,
    ),
    updatedAt: environmentValue(
      "NOTION_CHANGELOG_UPDATED_AT_PROPERTY_ID",
      command,
    ),
  };
}
