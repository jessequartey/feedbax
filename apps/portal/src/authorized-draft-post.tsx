import type { DraftPost } from "@feedbax/feedback";
import { useEffect, useState } from "react";
import { PortalFeedbackForm } from "./portal-feedback-form";
import { readCapabilities } from "./browser-post-state";
import { getPortalDraftPost } from "./portal-feedback-server-function";
import { PublicPostUnavailable } from "./public-post-unavailable";

export function AuthorizedDraftPost({ slug }: { slug: string }) {
  const [post, setPost] = useState<DraftPost | null>();
  useEffect(() => {
    const capability = Object.values(readCapabilities(localStorage)).find(
      (item) => item.slug === slug,
    );
    if (!capability) {
      setPost(null);
      return;
    }
    getPortalDraftPost({ data: capability })
      .then(setPost)
      .catch(() => setPost(null));
  }, [slug]);
  if (post === undefined)
    return (
      <main className="feedback-detail">
        <p>Loading Draft Post…</p>
      </main>
    );
  if (post === null) return <PublicPostUnavailable />;
  return (
    <main className="feedback-detail">
      <article>
        <div className="feedback-detail-meta">
          <span>Draft</span>
          <span>{post.type}</span>
        </div>
        <h1>{post.title}</h1>
        <p className="feedback-detail-description">{post.description}</p>
      </article>
      <PortalFeedbackForm
        initialDraft={{
          id: post.id,
          browserCapability: Object.values(readCapabilities(localStorage)).find(
            (item) => item.id === post.id,
          )!.browserCapability,
          title: post.title,
          description: post.description,
          type: post.type,
        }}
      />
    </main>
  );
}
