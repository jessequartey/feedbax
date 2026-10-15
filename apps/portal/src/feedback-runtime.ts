import {
  createImageModule,
  createImageFeedbackModule,
  createNotionImageReviewWriter,
  createConnectedStore,
  createConnectedFeedbackModule,
  createObservedHistoryModule,
  type VerifiedParticipant,
} from "@feedbax/feedback";
import { cache, env } from "cloudflare:workers";

import {
  createInvalidatingFeedbackModule,
  createPublicCacheInvalidator,
} from "./feedback-cache-invalidation";
import feedbax from "./feedbax";
import { createContentFeedbackModule } from "./configured-feedback";
import { createPortalIntegration } from "./integration-runtime";
import { createPublicReleaseFeedbackModule } from "./public-release-links";
import { createConfiguredChangelogModule } from "./changelog-runtime";

export const feedbackSubmissionLimits = {
  maxTitleLength: feedbax.submissions.maxTitleLength,
  maxDescriptionLength: feedbax.submissions.maxDescriptionLength,
} as const;

export function createConfiguredContentFeedbackModule(
  participant?: VerifiedParticipant,
) {
  return createContentFeedbackModule(
    feedbax,
    {
      FEEDBAX_DB: env.FEEDBAX_DB,
      NOTION_TOKEN: process.env.NOTION_TOKEN,
      GITHUB_SERVICE_SECRET: env.GITHUB_SERVICE_SECRET,
      ...(feedbax.provider === "github" && env.FEEDBAX_DB
        ? {
            getGitHubServiceSecret: () =>
              configuredIntegration().portalSecret(),
          }
        : {}),
    },
    fetch,
    participant,
  );
}

export function createConfiguredFeedbackModule(
  participant?: VerifiedParticipant,
) {
  const source = createConfiguredContentFeedbackModule(participant);
  const history = feedbax.history ? configuredHistory(source) : undefined;
  const content = history
    ? { ...source, getPublicPost: history.observe }
    : source;
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
        feedbax.provider === "github"
          ? undefined
          : createNotionImageReviewWriter({
              token: requiredEnvironmentValue("NOTION_TOKEN"),
              reviewUrl: (id) => images.reviewUrl(id, feedbax.product.siteUrl!),
            }),
      )
    : feedback;
  return createInvalidatingFeedbackModule({
    feedback: createPublicReleaseFeedbackModule({
      feedback: withImages,
      siteUrl: feedbax.product.siteUrl,
      ...(feedbax.features.changelog && feedbax.changelog
        ? { changelog: createConfiguredChangelogModule(true) }
        : {}),
    }),
    invalidator: createPublicCacheInvalidator({
      purge: (options) => cache.purge(options),
    }),
  });
}

export function configuredHistory(
  feedback = createConfiguredContentFeedbackModule(),
) {
  if (!feedbax.history || !env.FEEDBAX_DB)
    throw new Error(
      "Observed history requires explicit history configuration and FEEDBAX_DB.",
    );
  return createObservedHistoryModule({ database: env.FEEDBAX_DB, feedback });
}

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

export function configuredIntegration() {
  if (!env.FEEDBAX_DB)
    throw new Error("GitHub requires the FEEDBAX_DB D1 binding.");
  return createPortalIntegration({
    config: feedbax,
    database: env.FEEDBAX_DB,
    pairingSecret: env.GITHUB_PAIRING_SECRET,
  });
}
