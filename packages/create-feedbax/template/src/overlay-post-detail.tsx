import { useQuery } from "@tanstack/react-query";

import {
  getPublicPost,
  getPublicPostComments,
} from "./public-post-server-function";
import { PublicPostDetailSkeleton } from "./public-post-detail-skeleton";
import { publicPostQuery } from "./post-detail-query";
import { PostDetailContent } from "./post-detail-content";
import { AuthorizedDraftPost } from "./authorized-draft-post";
import { mutatePublicComment, submitPublicComment } from "./public-post-route";

const loadComments = (slug: string, cursor?: string) =>
  getPublicPostComments({ data: { slug, ...(cursor ? { cursor } : {}) } });

export function OverlayPostDetail({ slug }: { slug: string }) {
  return <OverlayPost key={slug} slug={slug} />;
}

function OverlayPost({ slug }: { slug: string }) {
  const query = useQuery(
    publicPostQuery(slug, (value) => getPublicPost({ data: { slug: value } })),
  );
  const post = query.data;

  return (
    <div className="overlay-post-detail">
      {query.isPending ? (
        <PublicPostDetailSkeleton display="overlay" />
      ) : post ? (
        <PostDetailContent
          post={post}
          display="overlay"
          loadComments={loadComments}
          submitComment={submitPublicComment}
          mutateComment={mutatePublicComment}
        />
      ) : (
        <AuthorizedDraftPost slug={slug} />
      )}
    </div>
  );
}
