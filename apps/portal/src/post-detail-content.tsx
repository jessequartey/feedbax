import type { CommentThreadPage, CreatedComment } from "@feedbax/feedback";
import { type ComponentProps, useMemo } from "react";
import {
  type InfiniteData,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { mergeCommentThreads } from "./comment-thread-page";
import { PublicPostDetail } from "./public-post-detail";
import {
  publicPostCommentsQuery,
  type FetchPostComments,
} from "./post-detail-query";
import feedbax from "./feedbax";

type Props = Omit<
  ComponentProps<typeof PublicPostDetail>,
  "comments" | "loadMore"
> & { loadComments?: FetchPostComments };
type Pages = InfiniteData<CommentThreadPage, string | undefined>;
const emptyComments: FetchPostComments = async () => ({ items: [] });

export function PostDetailContent(props: Props) {
  return <PostDiscussion key={props.post.slug} {...props} />;
}

function PostDiscussion({ loadComments, ...props }: Props) {
  const client = useQueryClient();
  const options = publicPostCommentsQuery(
    props.post.slug,
    loadComments ?? emptyComments,
  );
  const query = useInfiniteQuery({
    ...options,
    enabled:
      (props.features ?? feedbax.features).comments && Boolean(loadComments),
  });
  const comments = useMemo(
    () => ({
      items:
        query.data?.pages.reduce(
          (current, page) => mergeCommentThreads(current, page.items),
          [] as CommentThreadPage["items"],
        ) ?? [],
    }),
    [query.data],
  );
  function updatePages(update: (pages: Pages) => Pages) {
    client.setQueryData<Pages>(options.queryKey, (current) =>
      update(current ?? { pages: [{ items: [] }], pageParams: [undefined] }),
    );
  }
  return (
    <PublicPostDetail
      {...props}
      comments={comments}
      commentsLoading={query.isFetching}
      commentsLoadError={query.isError}
      retryComments={() => {
        if (query.isFetchNextPageError) void query.fetchNextPage();
        else void query.refetch();
      }}
      loadMore={
        query.hasNextPage && !query.isError
          ? async () => {
              await query.fetchNextPage();
            }
          : undefined
      }
      submitComment={
        props.submitComment
          ? async (input) => {
              await client.cancelQueries({ queryKey: options.queryKey });
              try {
                const confirmed = await props.submitComment!(input);
                updatePages((current) => upsertComment(current, confirmed));
                return confirmed;
              } finally {
                void client.invalidateQueries({ queryKey: options.queryKey });
              }
            }
          : undefined
      }
      mutateComment={
        props.mutateComment
          ? async (input) => {
              await client.cancelQueries({ queryKey: options.queryKey });
              try {
                const result = await props.mutateComment!(input);
                updatePages((current) => ({
                  ...current,
                  pages: current.pages.map((page) => ({
                    ...page,
                    items: page.items
                      .map((thread) => ({
                        ...thread,
                        comments: thread.comments.flatMap((comment) =>
                          comment.id !== input.commentId
                            ? [comment]
                            : input.action === "delete"
                              ? []
                              : [{ ...comment, body: input.body! }],
                        ),
                      }))
                      .filter((thread) => thread.comments.length > 0),
                  })),
                }));
                return result;
              } finally {
                void client.invalidateQueries({ queryKey: options.queryKey });
              }
            }
          : undefined
      }
    />
  );
}

function upsertComment(current: Pages, comment: CreatedComment): Pages {
  // Cache only the public projection; browser edit capabilities stay outside it.
  const publicComment = {
    id: comment.id,
    body: comment.body,
    ...(comment.images?.length
      ? {
          images: comment.images.map((image) => ({
            id: image.id,
            src: image.src,
            contentType: image.contentType,
            bytes: image.bytes,
          })),
        }
      : {}),
    createdAt: comment.createdAt,
    author:
      comment.author.kind === "participant"
        ? {
            kind: "participant" as const,
            displayName: comment.author.displayName,
            ...(comment.author.verified ? { verified: true } : {}),
          }
        : {
            kind: "product-team" as const,
            displayName: comment.author.displayName,
          },
  };
  const thread = { id: comment.discussionId, comments: [publicComment] };
  const present = current.pages.some((page) =>
    page.items.some((item) => item.id === thread.id),
  );
  return {
    ...current,
    pages: current.pages.map((page, index) => ({
      ...page,
      items:
        (index === 0 && !present) ||
        page.items.some((item) => item.id === thread.id)
          ? mergeCommentThreads(page.items, [thread])
          : page.items,
    })),
  };
}
