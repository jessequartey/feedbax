import {
  createChangelogModule,
  createInMemoryChangelogStorage,
  createNotionChangelogStorage,
} from "@feedbax/changelog";

import feedbax from "./feedbax";
import { requiredEnvironmentValue } from "./feedback-runtime";

let configuredChangelog: ReturnType<typeof createChangelogModule> | undefined;

export function createConfiguredChangelogModule() {
  configuredChangelog ??= buildConfiguredChangelogModule();
  return configuredChangelog;
}

function buildConfiguredChangelogModule() {
  if (import.meta.env.MODE === "demo") {
    return createChangelogModule({ storage: createInMemoryChangelogStorage() });
  }
  if (!feedbax.changelog) {
    throw new Error("Changelog configuration is missing.");
  }
  return createChangelogModule({
    storage: createNotionChangelogStorage({
      token: requiredEnvironmentValue("NOTION_TOKEN"),
      dataSourceId: feedbax.changelog.dataSourceId,
      propertyIds: feedbax.changelog.propertyIds,
    }),
  });
}
