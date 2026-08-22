import { infiniteQueryOptions } from "@tanstack/react-query";
import type { PublicFeedbackQuery, PublicPostPage } from "@feedbax/feedback";
import { getPublicFeedbackPage } from "./public-feedback-server-function";

type FetchPublicPostsPage = (
  search: PublicFeedbackQuery,
) => Promise<PublicPostPage>;

const fetchPublicPostsPage: FetchPublicPostsPage = (search) =>
  getPublicFeedbackPage({ data: search });

export function publicPostsQuery(
  search: PublicFeedbackQuery,
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
