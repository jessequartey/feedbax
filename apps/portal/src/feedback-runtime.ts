import { createNotionFeedbackModule } from "@feedbax/feedback";
import { cache } from "cloudflare:workers";

import {
  createInvalidatingFeedbackModule,
  createPublicCacheInvalidator,
} from "./feedback-cache-invalidation";
import feedbax from "./feedbax";

export const feedbackSubmissionLimits = {
  maxTitleLength: feedbax.submissions.maxTitleLength,
  maxDescriptionLength: feedbax.submissions.maxDescriptionLength,
} as const;

export function createConfiguredFeedbackModule() {
  configuredFeedback ??= createInvalidatingFeedbackModule({
    feedback: createNotionFeedbackModule({
      votingEnabled: feedbax.features.voting,
      commentsEnabled: feedbax.features.comments,
      token: requiredEnvironmentValue("NOTION_TOKEN"),
      dataSourceId: feedbax.notion.dataSourceId,
      propertyIds: feedbax.notion.properties,
    }),
    invalidator: createPublicCacheInvalidator({
      purge: (options) => cache.purge(options),
    }),
  });
  return configuredFeedback;
}

let configuredFeedback:
  ReturnType<typeof createInvalidatingFeedbackModule> | undefined;

export function requiredEnvironmentValue(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error("Feedback configuration is missing.");
  return value;
}
