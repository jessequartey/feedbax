import { infiniteQueryOptions } from "@tanstack/react-query";
import type { PublicPostQuery, PublicPostPage } from "@feedbax/feedback";

export type FetchPublicPostsPage = (
  search: PublicPostQuery,
) => Promise<PublicPostPage>;

export function publicPostsQuery(
  search: PublicPostQuery,
  fetchPage: FetchPublicPostsPage,
) {
  const querySearch = { ...search, cursor: undefined };
  return infiniteQueryOptions({
    queryKey: ["public-posts", querySearch] as const,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      fetchPage({
        ...querySearch,
        ...(pageParam ? { cursor: pageParam } : {}),
      }),
    getNextPageParam: (page) => page.nextCursor,
    staleTime: 30_000,
  });
}
