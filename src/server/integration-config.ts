import { env } from "cloudflare:workers";
import base from "../../feedbax.config.ts";
import type { FeedbaxConfig } from "../contracts/config.ts";

/** Runtime-only overrides: neither integration credentials nor target repos enter the client bundle. */
export function integrationSettings(
  settings: FeedbaxConfig,
  bindings: Pick<
    Cloudflare.Env,
    "FEEDBAX_GITHUB_ENABLED" | "FEEDBAX_GITHUB_REPO" | "FEEDBAX_NOTION_DATA_SOURCE_ID"
  >,
) {
  let github = settings.integrations.github;
  if (bindings.FEEDBAX_GITHUB_ENABLED === "false") github = false;
  if (bindings.FEEDBAX_GITHUB_ENABLED === "true") {
    if (!/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(bindings.FEEDBAX_GITHUB_REPO ?? ""))
      throw new Error("Set FEEDBAX_GITHUB_REPO to owner/repo before enabling GitHub sync.");
    github = { repo: bindings.FEEDBAX_GITHUB_REPO! };
  }
  const notion = bindings.FEEDBAX_NOTION_DATA_SOURCE_ID
    ? { dataSourceId: bindings.FEEDBAX_NOTION_DATA_SOURCE_ID }
    : settings.integrations.notion;
  if (github === settings.integrations.github && notion === settings.integrations.notion)
    return settings.integrations;
  return { github, notion };
}
export const integrationConfig = new Proxy(base, {
  get(target, property, receiver) {
    return property === "integrations"
      ? integrationSettings(target, env)
      : Reflect.get(target, property, receiver);
  },
});
export function issueLabels(value = env.FEEDBAX_GITHUB_LABELS): string[] {
  const labels =
    value
      ?.split(",")
      .map((label) => label.trim())
      .filter(Boolean) ?? [];
  if (
    labels.length > 10 ||
    labels.some((label) => !/^[A-Za-z0-9][A-Za-z0-9 _:-]{0,49}$/.test(label))
  )
    throw new Error("Invalid FEEDBAX_GITHUB_LABELS configuration.");
  return labels;
}
