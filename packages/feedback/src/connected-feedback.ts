import { createHash } from "node:crypto";
import {
  type FeedbackModule,
  type PublicPost,
  PublicPostCursorError,
  VoteEligibilityError,
  recoverableComment,
  CommentValidationError,
  roadmapStatuses,
  type PublicPostRoadmap,
} from "./index";
import type { ConnectedStore, VerifiedParticipant } from "./connected";

export function createConnectedFeedbackModule(
  base: FeedbackModule,
  store: ConnectedStore,
  participant?: VerifiedParticipant,
): FeedbackModule {
  const enrich = async (post: PublicPost): Promise<PublicPost> => ({
    ...post,
    ...(post.voteCount !== undefined
      ? { voteCount: (await store.voteState(post.slug)).voteCount }
      : {}),
  });
  const enrichPage = async (posts: PublicPost[]) => {
    const counts = await store.voteCounts(
      posts
        .filter((post) => post.voteCount !== undefined)
        .map((post) => post.slug),
    );
    return posts.map((post) => ({
      ...post,
      ...(post.voteCount !== undefined
        ? { voteCount: counts.get(post.slug) ?? 0 }
        : {}),
    }));
  };
  const authorizeComment = async (commentId: string) => {
    const identity = requireParticipant();
    const subject = await store.commentSubject(commentId);
    if (subject && subject !== identity.subject)
      throw new Error("This Comment belongs to another Participant.");
  };
  const requireParticipant = () => {
    if (!participant) throw new Error("Sign in to participate.");
    return participant;
  };
  const create = async (
    input: Parameters<FeedbackModule["createComment"]>[0] & {
      discussionId?: string;
    },
  ) => {
    const identity = requireParticipant();
    if (
      input.submissionKey !== undefined &&
      !/^[A-Za-z0-9_-]{43}$/.test(input.submissionKey)
    )
      throw new CommentValidationError("Comment intent is invalid.");
    const command = {
      ...input,
      displayName: identity.displayName,
      ...(input.submissionKey
        ? {
            submissionKey: createHash("sha256")
              .update(
                JSON.stringify([
                  "feedbax-verified-comment-v1",
                  identity.subject,
                  input.submissionKey,
                ]),
              )
              .digest("base64url"),
          }
        : {}),
    };
    const comment = input.discussionId
      ? await base.replyToCommentThread({
          ...command,
          discussionId: input.discussionId,
        })
      : await base.createComment(command);
    // Stable provider intents retain their record for attribution recovery. Older adapters compensate best-effort; verification is returned only after the private write.
    try {
      await store.attributeComment(comment.id, identity);
    } catch (error) {
      if (!comment[recoverableComment])
        await base
          .deleteComment({ commentId: comment.id })
          .catch(() => undefined);
      throw error;
    }
    return Object.defineProperty(
      {
        ...comment,
        author: {
          kind: "participant" as const,
          displayName: identity.displayName,
          verified: true,
        },
      },
      recoverableComment,
      { value: comment[recoverableComment] },
    );
  };
  const listPublicRoadmapPosts: FeedbackModule["listPublicRoadmapPosts"] =
    async (query) => {
      const page = await base.listPublicRoadmapPosts(query);
      return { ...page, items: await enrichPage(page.items) };
    };
  return {
    ...base,
    async getPublicPost(slug) {
      const post = await base.getPublicPost(slug);
      return post ? enrich(post) : undefined;
    },
    async listPublicPosts(query = {}) {
      if (query.sort === "new") {
        const page = await base.listPublicPosts(query);
        return { ...page, items: await enrichPage(page.items) };
      }
      // Rank the complete eligible set, not an already paginated Notion counter projection.
      const { cursor, ...filters } = query;
      const fingerprint = JSON.stringify(filters);
      let offset = 0;
      if (cursor) {
        try {
          const value = JSON.parse(Buffer.from(cursor, "base64url").toString());
          if (
            value.query !== fingerprint ||
            !Number.isSafeInteger(value.offset) ||
            value.offset < 0
          )
            throw new Error();
          offset = value.offset;
        } catch {
          throw new PublicPostCursorError();
        }
      }
      const all: PublicPost[] = [];
      let next: string | undefined;
      do {
        const page = await base.listPublicPosts({
          ...filters,
          sort: "new",
          cursor: next,
        });
        all.push(...(await enrichPage(page.items)));
        next = page.nextCursor;
      } while (next);
      all.sort(
        (a, b) =>
          (b.voteCount ?? 0) - (a.voteCount ?? 0) ||
          b.createdAt.getTime() - a.createdAt.getTime() ||
          b.slug.localeCompare(a.slug),
      );
      return {
        items: all.slice(offset, offset + 25),
        ...(offset + 25 < all.length
          ? {
              nextCursor: Buffer.from(
                JSON.stringify({ query: fingerprint, offset: offset + 25 }),
              ).toString("base64url"),
            }
          : {}),
      };
    },
    listPublicRoadmapPosts,
    async getPublicPostRoadmap() {
      return Object.fromEntries(
        await Promise.all(
          roadmapStatuses.map(async (status) => [
            status,
            await listPublicRoadmapPosts({ status }),
          ]),
        ),
      ) as PublicPostRoadmap;
    },
    async changeVote(input) {
      const identity = requireParticipant();
      const post = await base.getPublicPost(input.slug);
      if (!post || post.voteCount === undefined)
        throw new VoteEligibilityError();
      await store.setVote(
        input.slug,
        identity.subject,
        input.intention === "add",
      );
      return {
        slug: input.slug,
        ...(await store.voteState(input.slug, identity.subject)),
      };
    },
    async editComment(input) {
      await authorizeComment(input.commentId);
      const comment = await base.editComment(input);
      return {
        ...comment,
        author: (await store.commentAuthor(comment.id)) ?? comment.author,
      };
    },
    async deleteComment(input) {
      await authorizeComment(input.commentId);
      await base.deleteComment(input);
    },
    createComment: create,
    replyToCommentThread: create,
    async listCommentThreads(input) {
      const page = await base.listCommentThreads(input);
      const authors = await store.commentAuthors(
        page.items.flatMap((thread) =>
          thread.comments
            .filter((comment) => comment.author.kind !== "product-team")
            .map((comment) => comment.id),
        ),
      );
      return {
        ...page,
        items: await Promise.all(
          page.items.map(async (thread) => ({
            ...thread,
            comments: await Promise.all(
              thread.comments.map(async (comment) => ({
                ...comment,
                author:
                  comment.author.kind === "product-team"
                    ? comment.author
                    : (authors.get(comment.id) ?? comment.author),
              })),
            ),
          })),
        ),
      };
    },
  };
}
