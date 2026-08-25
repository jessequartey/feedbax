import { useEffect, useState } from "react";
import type { PublicPost } from "@feedbax/feedback";
import { ExternalLink } from "lucide-react";

import { getPublicPost } from "./public-post-server-function";
import {
  PublicPostDetail,
  PublicPostDetailSkeleton,
} from "./public-post-detail";
import { AuthorizedDraftPost } from "./authorized-draft-post";

export function OverlayPostDetail({ slug }: { slug: string }) {
  const [post, setPost] = useState<PublicPost | null>();
  useEffect(() => {
    let current = true;
    setPost(undefined);
    getPublicPost({ data: { slug } })
      .then((value) => current && setPost(value))
      .catch(() => current && setPost(null));
    return () => {
      current = false;
    };
  }, [slug]);

  if (post === undefined) return <PublicPostDetailSkeleton />;
  return (
    <div className="overlay-post-detail">
      <a
        className="post-full-page-link"
        href={`/p/${encodeURIComponent(slug)}`}
      >
        Open full page <ExternalLink aria-hidden="true" />
      </a>
      {post ? (
        <PublicPostDetail post={post} display="overlay" />
      ) : (
        <AuthorizedDraftPost slug={slug} />
      )}
    </div>
  );
}
