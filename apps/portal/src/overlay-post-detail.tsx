import { useEffect, useState } from "react";
import type { CommentThreadPage, PublicPost } from "@feedbax/feedback";
import { ExternalLink } from "lucide-react";

import {
  getPublicPost,
  getPublicPostComments,
} from "./public-post-server-function";
import {
  PublicPostDetail,
  PublicPostDetailSkeleton,
} from "./public-post-detail";
import { AuthorizedDraftPost } from "./authorized-draft-post";
import { mutatePublicComment, submitPublicComment } from "./public-post-route";
import { mergeCommentThreads } from "./comment-thread-page";

type OverlayDetail = {
  post: PublicPost | null;
  comments: CommentThreadPage;
};

export function OverlayPostDetail({ slug }: { slug: string }) {
  const [detail, setDetail] = useState<OverlayDetail>();
  useEffect(() => {
    let current = true;
    setDetail(undefined);
    getPublicPost({ data: { slug } })
      .then(async (post) => ({
        post: post ?? null,
        comments: post
          ? await getPublicPostComments({ data: { slug } }).catch(() => ({
              items: [],
            }))
          : { items: [] },
      }))
      .then((value) => current && setDetail(value))
      .catch(
        () => current && setDetail({ post: null, comments: { items: [] } }),
      );
    return () => {
      current = false;
    };
  }, [slug]);

  if (detail === undefined) return <PublicPostDetailSkeleton />;
  return (
    <div className="overlay-post-detail">
      <a
        className="post-full-page-link"
        href={`/p/${encodeURIComponent(slug)}`}
      >
        Open full page <ExternalLink aria-hidden="true" />
      </a>
      {detail.post ? (
        <PublicPostDetail
          post={detail.post}
          display="overlay"
          comments={detail.comments}
          submitComment={submitPublicComment}
          mutateComment={mutatePublicComment}
          loadMore={
            detail.comments.nextCursor
              ? async () => {
                  const next = await getPublicPostComments({
                    data: { slug, cursor: detail.comments.nextCursor },
                  });
                  setDetail((current) =>
                    current
                      ? {
                          ...current,
                          comments: {
                            items: mergeCommentThreads(
                              current.comments.items,
                              next.items,
                            ),
                            ...(next.nextCursor
                              ? { nextCursor: next.nextCursor }
                              : {}),
                          },
                        }
                      : current,
                  );
                }
              : undefined
          }
        />
      ) : (
        <AuthorizedDraftPost slug={slug} />
      )}
    </div>
  );
}
