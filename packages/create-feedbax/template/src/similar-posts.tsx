import type { PublicPostPage } from "@feedbax/feedback";
import { useEffect, useRef, useState } from "react";

import { getPublicPostPage } from "./public-feedback-server-function";

export const similarPostMinimumTitleLength = 4;

export function SimilarPosts({ title }: { title: string }) {
  const [posts, setPosts] = useState<PublicPostPage["items"]>([]);
  const requestSequence = useRef(0);

  useEffect(() => {
    const query = title.trim();
    const sequence = ++requestSequence.current;
    if (query.length < similarPostMinimumTitleLength) {
      setPosts([]);
      return;
    }
    const timeout = window.setTimeout(() => {
      void getPublicPostPage({ data: { search: query, sort: "top" } })
        .then((page) => {
          if (sequence === requestSequence.current)
            setPosts(page.items.slice(0, 3));
        })
        .catch(() => {
          if (sequence === requestSequence.current) setPosts([]);
        });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [title]);

  if (!posts.length) return null;
  return (
    <aside aria-label="Potentially related Posts">
      <p className="feedback-eyebrow">Potentially related</p>
      <ul>
        {posts.map((post) => (
          <li key={post.slug}>
            <a href={`/p/${encodeURIComponent(post.slug)}`}>{post.title}</a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
