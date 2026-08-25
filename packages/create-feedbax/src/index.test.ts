import { describe, expect, it } from "vitest";

import {
  collectFeatureSelection,
  featureChoices,
  renderFeatureConfiguration,
} from "./index";

describe("creator capability choices", () => {
  it("presents every capability as enabled by default", async () => {
    const prompts: { message: string; initialValue: boolean }[] = [];
    const confirm = async (input: {
      message: string;
      initialValue: boolean;
    }) => {
      prompts.push(input);
      return true;
    };

    await expect(collectFeatureSelection({ confirm })).resolves.toEqual({
      voting: true,
      comments: true,
      changelog: true,
    });
    expect(featureChoices.map(({ key }) => key)).toEqual([
      "voting",
      "comments",
      "changelog",
    ]);
    expect(prompts.map(({ initialValue }) => initialValue)).toEqual([
      true,
      true,
      true,
    ]);
  });

  it("emits explicit opt-outs in typed configuration", async () => {
    const answers = [true, false, true];
    const features = await collectFeatureSelection({
      confirm: async () => answers.shift() ?? true,
    });

    expect(renderFeatureConfiguration(features)).toBe(`features: {
    voting: true,
    comments: false,
    changelog: true,
  },`);
  });
});
