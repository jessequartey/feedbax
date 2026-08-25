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
