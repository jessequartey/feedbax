import type {
  FeedbackModule,
  FeedbackStatus,
  FeedbackType,
  PublicFeedbackPage,
  PublicFeedbackQuery,
} from "@feedbax/feedback";

export const feedbackTypes = [
  "Feature Request",
  "Bug Report",
  "General Feedback",
] as const satisfies readonly FeedbackType[];

export const feedbackStatuses = [
  "New",
  "Reviewing",
  "Planned",
  "In Progress",
  "Shipped",
  "Closed",
] as const satisfies readonly FeedbackStatus[];

export async function loadPublicFeedbackPage({
  feedback,
  search,
}: {
  feedback: Pick<FeedbackModule, "listPublic">;
  search: Record<string, unknown>;
}): Promise<PublicFeedbackPage> {
  return feedback.listPublic(publicFeedbackSearch(search));
}

export function publicFeedbackSearch(
  search: Record<string, unknown>,
): PublicFeedbackQuery {
  const cursor = stringValue(search.cursor);
  const type = stringValue(search.type);
  const status = stringValue(search.status);

  return {
    ...(cursor ? { cursor } : {}),
    ...(isIncluded(feedbackTypes, type) ? { type } : {}),
    ...(isIncluded(feedbackStatuses, status) ? { status } : {}),
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function isIncluded<Value extends string>(
  values: readonly Value[],
  value: string | undefined,
): value is Value {
  return value !== undefined && values.includes(value as Value);
}
