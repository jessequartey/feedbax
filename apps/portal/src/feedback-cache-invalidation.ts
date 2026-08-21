import type { FeedbackModule } from "@feedbax/feedback";

import {
  publicFeedbackCacheTag,
  publicFeedbackItemCacheTag,
} from "./public-cache-tags";

interface PublicCacheInvalidator {
  invalidateFeedbackItem(id: string): Promise<void>;
}

interface CachePurgeResult {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
}

type PurgePublicCache = (options: {
  tags: string[];
}) => Promise<CachePurgeResult>;

export function createPublicCacheInvalidator({
  purge,
}: {
  purge: PurgePublicCache;
}): PublicCacheInvalidator {
  return {
    async invalidateFeedbackItem(id) {
      const result = await purge({
        tags: [publicFeedbackCacheTag, publicFeedbackItemCacheTag(id)],
      });
      if (!result.success) {
        throw new Error("Public feedback cache invalidation failed.");
      }
    },
  };
}

export function createInvalidatingFeedbackModule({
  feedback,
  invalidator,
}: {
  feedback: FeedbackModule;
  invalidator: PublicCacheInvalidator;
}): FeedbackModule {
  return {
    submitPost: (input) =>
      runInvalidatingWrite(() => feedback.submitPost(input), invalidator),
    editDraftPost: (input) =>
      runInvalidatingWrite(() => feedback.editDraftPost(input), invalidator),
    getPublicPost: (slug) => feedback.getPublicPost(slug),
    getDraftPost: (input) => feedback.getDraftPost(input),
    listPublicPosts: (query) => feedback.listPublicPosts(query),
    submit: (input) =>
      runInvalidatingWrite(() => feedback.submit(input), invalidator),
    submitTrusted: (input) =>
      runInvalidatingWrite(() => feedback.submitTrusted(input), invalidator),
    editDraft: (input) =>
      runInvalidatingWrite(() => feedback.editDraft(input), invalidator),
    async withdrawDraft(input) {
      await feedback.withdrawDraft(input);
      await invalidator.invalidateFeedbackItem(input.id);
    },
    getPublic: (id) => feedback.getPublic(id),
    listPublic: (query) => feedback.listPublic(query),
    getPublicRoadmap: () => feedback.getPublicRoadmap(),
    getPublicPostRoadmap: () => feedback.getPublicPostRoadmap(),
  };
}

async function runInvalidatingWrite<Item extends { id: string }>(
  write: () => Promise<Item>,
  invalidator: PublicCacheInvalidator,
): Promise<Item> {
  const item = await write();
  await invalidator.invalidateFeedbackItem(item.id);
  return item;
}
