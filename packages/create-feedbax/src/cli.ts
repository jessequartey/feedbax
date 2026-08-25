#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import {
  collectFeatureSelection,
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
  if (features.comments) {
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
    stdout.write(
      "\nComment capabilities are configured. No changes were made.\n",
    );
    process.exitCode = 0;
  } else {
    stdout.write(
      `\nAdd this to feedbax.ts:\n\n${renderFeatureConfiguration(features)}\n`,
    );
  }
} finally {
  terminal.close();
}
