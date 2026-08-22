import { infiniteQueryOptions } from "@tanstack/react-query";
import type { PublicPostQuery, PublicPostPage } from "@feedbax/feedback";
import { getPublicPostPage } from "./public-feedback-server-function";

type FetchPublicPostsPage = (
  search: PublicPostQuery,
) => Promise<PublicPostPage>;

const fetchPublicPostsPage: FetchPublicPostsPage = (search) =>
  getPublicPostPage({ data: search });

export function publicPostsQuery(
  search: PublicPostQuery,
  fetchPage: FetchPublicPostsPage = fetchPublicPostsPage,
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
