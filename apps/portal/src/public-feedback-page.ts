import type {
  FeedbackModule,
  PostStatus,
  PostType,
  PublicFeedbackQuery,
  PublicPostPage,
} from "@feedbax/feedback";

export const postTypes = [
  "Feature Request",
  "Bug Report",
  "General Feedback",
] as const satisfies readonly PostType[];
export const postStatuses = [
  "New",
  "Reviewing",
  "Planned",
  "In Progress",
  "Shipped",
  "Closed",
] as const satisfies readonly PostStatus[];
export const feedbackTypes = postTypes;
export const feedbackStatuses = postStatuses;
export const postSorts = ["trending", "top", "new"] as const;

export async function loadPublicFeedbackPage({
  feedback,
  search,
}: {
  feedback: Pick<FeedbackModule, "listPublicPosts">;
  search: Record<string, unknown>;
}): Promise<PublicPostPage> {
  return feedback.listPublicPosts(publicFeedbackSearch(search));
}

export function publicFeedbackSearch(
  search: Record<string, unknown>,
): PublicFeedbackQuery {
  const cursor = text(search.cursor);
  const query = text(search.search);
  const sortValue = text(search.sort);
  return {
    ...(cursor ? { cursor } : {}),
    ...(query ? { search: query } : {}),
    sort: postSorts.includes(sortValue as (typeof postSorts)[number])
      ? (sortValue as PublicFeedbackQuery["sort"])
      : "trending",
    types: values(search.types).filter((value): value is PostType =>
      postTypes.includes(value as PostType),
    ),
    statuses: values(search.statuses).filter((value): value is PostStatus =>
      postStatuses.includes(value as PostStatus),
    ),
  };
}

function text(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}
function values(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : typeof value === "string"
      ? value.split(",").filter(Boolean)
      : [];
}
