import type { CommentThreadPage, PublicPost } from "@feedbax/feedback";
import { infiniteQueryOptions, queryOptions } from "@tanstack/react-query";

export const publicPostQueryKey = ["public-post"] as const;
export type FetchPostComments = (
  slug: string,
  cursor?: string,
) => Promise<CommentThreadPage>;

export function publicPostQuery(
  slug: string,
  loadPost: (slug: string) => Promise<PublicPost | undefined>,
) {
  return queryOptions({
    queryKey: [...publicPostQueryKey, slug],
    queryFn: async () => (await loadPost(slug)) ?? null,
    staleTime: 30_000,
    retry: false,
  });
}

export function publicPostCommentsQuery(
  slug: string,
  loadComments: FetchPostComments,
) {
  return infiniteQueryOptions({
    queryKey: ["public-post-comments", slug],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => loadComments(slug, pageParam),
    getNextPageParam: (page) => page.nextCursor,
    staleTime: 0,
    retry: false,
  });
}
