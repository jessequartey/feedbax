import type { FeedbackModule, CreateCommentInput } from "./index";
import type { createImageModule, ImageAttachment } from "./images";

export function createImageFeedbackModule(
  base: FeedbackModule,
  images: ReturnType<typeof createImageModule>,
  writeReview?: (postId: string, images: ImageAttachment[]) => Promise<void>,
): FeedbackModule {
  const create = async (
    input: CreateCommentInput & { discussionId?: string },
  ) => {
    const ids = input.imageIds ?? [];
    await images.validatePending(ids);
    const comment = input.discussionId
      ? await base.replyToCommentThread({
          ...input,
          discussionId: input.discussionId,
        })
      : await base.createComment(input);
    if (!ids.length) return comment;
    try {
      return {
        ...comment,
        images: await images.attachComment({
          ids,
          slug: input.slug,
          commentId: comment.id,
        }),
      };
    } catch (error) {
      try {
        await base.deleteComment({ commentId: comment.id });
        await images.discardAttached(input.slug, comment.id);
      } catch {
        /* External cleanup remains best effort; never expose an unpublished attachment. */
      }
      throw error;
    }
  };
  return {
    ...base,
    async submitPost(input) {
      const ids = input.imageIds ?? [];
      await images.validatePending(ids);
      const post = await base.submitPost(input);
      if (!ids.length) return post;
      try {
        const attached = await images.attachPost({
          ids,
          id: post.id,
          browserCapability: post.browserCapability,
        });
        await writeReview?.(post.id, attached);
        return { ...post, images: attached };
      } catch (error) {
        try {
          await base.withdrawDraftPost({
            id: post.id,
            browserCapability: post.browserCapability,
          });
          await images.discardAttached(post.slug);
        } catch {
          /* Preserve the private record for failed external cleanup. */
        }
        throw error;
      }
    },
    async getPublicPost(slug) {
      const post = await base.getPublicPost(slug);
      if (!post) return;
      const attached = await images.forPost(slug);
      return attached.length ? { ...post, images: attached } : post;
    },
    async getDraftPost(input) {
      const post = await base.getDraftPost(input);
      const attached = await images.forPost(post.slug);
      return attached.length ? { ...post, images: attached } : post;
    },
    createComment: create,
    replyToCommentThread: create,
    async listCommentThreads(input) {
      const page = await base.listCommentThreads(input);
      const attachments = await images.forComments(
        input.slug,
        page.items.flatMap((thread) =>
          thread.comments.map((comment) => comment.id),
        ),
      );
      return {
        ...page,
        items: page.items.map((thread) => ({
          ...thread,
          comments: thread.comments.map((comment) => {
            const attached = attachments.get(comment.id) ?? [];
            return attached.length ? { ...comment, images: attached } : comment;
          }),
        })),
      };
    },
  };
}
