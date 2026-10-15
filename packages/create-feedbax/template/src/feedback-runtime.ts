import {
  createImageModule,
  createImageFeedbackModule,
  createNotionImageReviewWriter,
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

export function createConfiguredNotionFeedbackModule() {
  configuredFeedback ??= createNotionFeedbackModule({
    votingEnabled: feedbax.features.voting,
    commentsEnabled: feedbax.features.comments,
    token: requiredEnvironmentValue("NOTION_TOKEN"),
    dataSourceId: feedbax.notion.dataSourceId,
    propertyIds: feedbax.notion.properties,
  });
  return configuredFeedback;
}

export function createConfiguredFeedbackModule(
  participant?: VerifiedParticipant,
) {
  const content = createConfiguredNotionFeedbackModule();
  const feedback = feedbax.connected
    ? createConnectedFeedbackModule(content, getConnectedStore(), participant)
    : content;
  const images = feedbax.connected?.images
    ? configuredImages(feedback, participant)
    : undefined;
  const withImages = images
    ? createImageFeedbackModule(
        feedback,
        images,
        createNotionImageReviewWriter({
          token: requiredEnvironmentValue("NOTION_TOKEN"),
          reviewUrl: (id) => images.reviewUrl(id, feedbax.product.siteUrl!),
        }),
      )
    : feedback;
  return createInvalidatingFeedbackModule({
    feedback: withImages,
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

export function configuredImages(
  feedback: import("@feedbax/feedback").FeedbackModule,
  participant?: VerifiedParticipant,
) {
  if (
    !env.FEEDBAX_DB ||
    !env.FEEDBAX_IMAGES ||
    !env.PARTICIPATION_SIGNING_SECRET ||
    env.PARTICIPATION_SIGNING_SECRET.length < 32
  )
    throw new Error(
      "Image attachments require D1, private R2, and the participation signing secret.",
    );
  return createImageModule({
    database: env.FEEDBAX_DB,
    bucket: env.FEEDBAX_IMAGES,
    feedback,
    participant,
    reviewSecret: env.PARTICIPATION_SIGNING_SECRET,
    processing: feedbax.connected?.processing ?? "small",
  });
}
export async function requestParticipant(request: Request) {
  if (!feedbax.connected) return;
  const { readSessionToken, sessionHash } =
    await import("./connected-identity");
  const token = readSessionToken(request);
  return token ? getConnectedStore().session(sessionHash(token)) : undefined;
}
