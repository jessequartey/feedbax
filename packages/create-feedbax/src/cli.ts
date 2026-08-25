#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import {
  collectFeatureSelection,
  renderFeatureConfiguration,
} from "./index.ts";

const terminal = createInterface({ input: stdin, output: stdout });

try {
  stdout.write("Configure optional Feedbax capabilities\n\n");
  const features = await collectFeatureSelection({
    confirm: async ({ message, initialValue }) => {
      const hint = initialValue ? "Y/n" : "y/N";
      const answer = (await terminal.question(`${message} (${hint}) `))
        .trim()
        .toLowerCase();
      if (!answer) return initialValue;
      return answer === "y" || answer === "yes";
    },
  });
  stdout.write(
    `\nAdd this to feedbax.ts:\n\n${renderFeatureConfiguration(features)}\n`,
  );
} finally {
  terminal.close();
}
