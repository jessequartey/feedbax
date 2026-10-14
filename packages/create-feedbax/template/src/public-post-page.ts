import type { FeedbackModule, PublicPost } from "@feedbax/feedback";

export async function loadPublicPost({
  feedback,
  slug,
}: {
  feedback: Pick<FeedbackModule, "getPublicPost">;
  slug: string;
}): Promise<PublicPost | undefined> {
  return feedback.getPublicPost(slug);
}

export function postPath(post: Pick<PublicPost, "slug">): string {
  return `/p/${encodeURIComponent(post.slug)}`;
}
