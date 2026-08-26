import type {
  FeedbackModule,
  PostStatus,
  PostType,
  PublicPostQuery,
  PublicPostPage,
} from "@feedbax/feedback";
import type { PortalFeatures } from "@feedbax/config";
import feedbax from "./feedbax";

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
export const postSorts = ["trending", "top", "new"] as const;

export async function loadPublicPostPage({
  feedback,
  search,
}: {
  feedback: Pick<FeedbackModule, "listPublicPosts">;
  search: Record<string, unknown>;
}): Promise<PublicPostPage> {
  return feedback.listPublicPosts(publicPostSearch(search));
}

export function publicPostSearch(
  search: Record<string, unknown>,
  features: PortalFeatures = feedbax.features,
): PublicPostQuery & { pageSize?: string; schema?: string } {
  const cursor = text(search.cursor);
  const query = text(search.search);
  const sortValue = text(search.sort);
  const types = values(search.types).filter((value): value is PostType =>
    postTypes.includes(value as PostType),
  );
  const statuses = values(search.statuses).filter(
    (value): value is PostStatus => postStatuses.includes(value as PostStatus),
  );
  return {
    ...(text(search.pageSize) ? { pageSize: text(search.pageSize) } : {}),
    ...(text(search.schema) ? { schema: text(search.schema) } : {}),
    ...(cursor ? { cursor } : {}),
    ...(query ? { search: query } : {}),
    sort: !features.voting
      ? "new"
      : postSorts.includes(sortValue as (typeof postSorts)[number])
        ? (sortValue as PublicPostQuery["sort"])
        : "trending",
    ...(types.length ? { types } : {}),
    ...(statuses.length ? { statuses } : {}),
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
