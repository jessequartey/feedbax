import type { DraftPost, PublicFeedbackQuery } from "@feedbax/feedback";
import { useEffect, useState } from "react";
import { draftPostCreatedEvent, readCapabilities } from "./browser-post-state";
import { formatPublicDate } from "./public-date";

export function DraftPostList({ search }: { search: PublicFeedbackQuery }) {
  const [drafts, setDrafts] = useState<DraftPost[]>([]);
  useEffect(() => {
    void import("./portal-feedback-server-function").then(
      ({ getPortalDraftPost }) =>
        Promise.allSettled(
          Object.values(readCapabilities(localStorage)).map((value) =>
            getPortalDraftPost({ data: value }),
          ),
        ).then((results) =>
          setDrafts(
            results.flatMap((result) =>
              result.status === "fulfilled" ? [result.value] : [],
            ),
          ),
        ),
    );
  }, []);
  useEffect(() => {
    const addCreatedDraft = (event: Event) => {
      const post = (event as CustomEvent<DraftPost>).detail;
      setDrafts((current) => [
        post,
        ...current.filter((item) => item.id !== post.id),
      ]);
    };
    window.addEventListener(draftPostCreatedEvent, addCreatedDraft);
    return () =>
      window.removeEventListener(draftPostCreatedEvent, addCreatedDraft);
  }, []);
  const query = search.search?.toLocaleLowerCase();
  const visible = drafts.filter(
    (post) =>
      (!query ||
        `${post.title}\n${post.description}`
          .toLocaleLowerCase()
          .includes(query)) &&
      (!search.types?.length || search.types.includes(post.type)) &&
      (!search.statuses?.length || search.statuses.includes(post.status)),
  );
  if (!visible.length) return null;
  return (
    <ol
      className="feedback-list draft-post-list"
      aria-label="Draft Posts editable from this browser"
    >
      {visible.map((post) => (
        <li key={post.id}>
          <a
            className="feedback-item-link draft-post-link"
            href={`/p/${encodeURIComponent(post.slug)}`}
          >
            <article>
              <div className="feedback-meta">
                <strong>Draft</strong>
                <span>{post.type}</span>
                <time dateTime={post.updatedAt.toISOString()}>
                  {formatPublicDate(post.updatedAt)}
                </time>
              </div>
              <h3>{post.title}</h3>
              <p>{post.description}</p>
            </article>
          </a>
        </li>
      ))}
    </ol>
  );
}
