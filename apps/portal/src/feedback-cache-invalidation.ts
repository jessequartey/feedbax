import type { FeedbackModule } from "@feedbax/feedback";

import {
  publicFeedbackCacheTag,
  publicPostCacheTag,
  publicRoadmapCacheTag,
} from "./public-cache-tags";

interface PublicCacheInvalidator {
  invalidatePost(slug: string): Promise<void>;
  invalidateVote(slug: string): Promise<void>;
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
  async function purgePost(slug: string, tags: string[]) {
    const result = await purge({
      tags: [publicFeedbackCacheTag, publicPostCacheTag(slug), ...tags],
    });
    if (!result.success) {
      throw new Error("Public feedback cache invalidation failed.");
    }
  }
  return {
    invalidatePost: (slug) => purgePost(slug, []),
    invalidateVote: (slug) => purgePost(slug, [publicRoadmapCacheTag]),
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
    async changeVote(input) {
      const result = await feedback.changeVote(input);
      await invalidator.invalidateVote(result.slug).catch(() => undefined);
      return result;
    },
    submitPost: (input) =>
      runInvalidatingWrite(() => feedback.submitPost(input), invalidator),
    editDraftPost: (input) =>
      runInvalidatingWrite(() => feedback.editDraftPost(input), invalidator),
    getPublicPost: (slug) => feedback.getPublicPost(slug),
    getDraftPost: (input) => feedback.getDraftPost(input),
    listPublicPosts: (query) => feedback.listPublicPosts(query),
    listPublicRoadmapPosts: (query) => feedback.listPublicRoadmapPosts(query),
    submitTrustedPost: (input) =>
      runInvalidatingWrite(
        () => feedback.submitTrustedPost(input),
        invalidator,
      ),
    async withdrawDraftPost(input) {
      const draft = await feedback.getDraftPost(input);
      await feedback.withdrawDraftPost(input);
      await invalidator.invalidatePost(draft.slug);
    },
    getPublicPostRoadmap: () => feedback.getPublicPostRoadmap(),
  };
}

async function runInvalidatingWrite<Item extends { slug: string }>(
  write: () => Promise<Item>,
  invalidator: PublicCacheInvalidator,
): Promise<Item> {
  const item = await write();
  await invalidator.invalidatePost(item.slug);
  return item;
}
