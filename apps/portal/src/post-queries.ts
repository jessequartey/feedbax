import { queryOptions } from "@tanstack/react-query";
import type { PublicFeedbackQuery } from "@feedbax/feedback";
import { getPublicFeedbackPage } from "./public-feedback-server-function";

export function publicPostsQuery(search: PublicFeedbackQuery) {
  return queryOptions({
    queryKey: ["public-posts", search] as const,
    queryFn: () => getPublicFeedbackPage({ data: search }),
    staleTime: 30_000,
  });
}
