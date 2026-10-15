import {
  createConnectedStore,
  createConnectedFeedbackModule,
  type VerifiedParticipant,
  createNotionFeedbackModule,
} from "@feedbax/feedback";
import { cache, env } from "cloudflare:workers";

import {
  createInvalidatingFeedbackModule,
  createPublicCacheInvalidator,
} from "./feedback-cache-invalidation";
import feedbax from "./feedbax";

export const feedbackSubmissionLimits = {
  maxTitleLength: feedbax.submissions.maxTitleLength,
  maxDescriptionLength: feedbax.submissions.maxDescriptionLength,
} as const;

export function createConfiguredFeedbackModule(
  participant?: VerifiedParticipant,
) {
  configuredFeedback ??= createNotionFeedbackModule({
    votingEnabled: feedbax.features.voting,
    commentsEnabled: feedbax.features.comments,
    token: requiredEnvironmentValue("NOTION_TOKEN"),
    dataSourceId: feedbax.notion.dataSourceId,
    propertyIds: feedbax.notion.properties,
  });
  const feedback = feedbax.connected
    ? createConnectedFeedbackModule(
        configuredFeedback,
        getConnectedStore(),
        participant,
      )
    : configuredFeedback;
  return createInvalidatingFeedbackModule({
    feedback,
    invalidator: createPublicCacheInvalidator({
      purge: (options) => cache.purge(options),
    }),
  });
}

let configuredFeedback:
  ReturnType<typeof createInvalidatingFeedbackModule> | undefined;

export function requiredEnvironmentValue(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error("Feedback configuration is missing.");
  return value;
}

export function getConnectedStore() {
  if (!feedbax.connected || !env.FEEDBAX_DB)
    throw new Error("Connected Profile requires the FEEDBAX_DB D1 binding.");
  return createConnectedStore(env.FEEDBAX_DB);
}
