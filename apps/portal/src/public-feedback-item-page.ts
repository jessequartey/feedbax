import type { FeedbackModule, PublicFeedbackItem } from "@feedbax/feedback";

export async function loadPublicFeedbackItem({
  feedback,
  id,
}: {
  feedback: Pick<FeedbackModule, "getPublic">;
  id: string;
  slug: string;
}): Promise<PublicFeedbackItem | undefined> {
  return feedback.getPublic(id);
}

export function feedbackItemPath(
  item: Pick<PublicFeedbackItem, "id" | "title">,
) {
  return `/feedback/${encodeURIComponent(item.id)}/${feedbackItemSlug(item.title)}`;
}

function feedbackItemSlug(title: string): string {
  return (
    title
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "feedback"
  );
}
