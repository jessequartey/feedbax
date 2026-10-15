import { requestNotion, type NotionRetryOptions } from "./notion-request";
import type { ImageAttachment } from "./images";
/** Private page-body links let Team Members review drafts without a second dashboard. */
export function createNotionImageReviewWriter(options: {
  token: string;
  reviewUrl(id: string): Promise<string>;
  request?: typeof fetch;
  retry?: NotionRetryOptions;
}) {
  return async (postId: string, images: ImageAttachment[]) => {
    const children = await Promise.all(
      images.map(async (image) => ({
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: {
                content: "Review Participant image",
                link: { url: await options.reviewUrl(image.id) },
              },
            },
          ],
        },
      })),
    );
    const response = await requestNotion(
      `https://api.notion.com/v1/blocks/${encodeURIComponent(postId)}/children`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${options.token}`,
          "Notion-Version": "2025-09-03",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ children }),
      },
      {
        operation: "create",
        retry: options.retry,
        request: (input, init) =>
          (options.request ?? fetch)(input, {
            ...init,
            signal: AbortSignal.timeout(10000),
          }),
      },
    );
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error("Image review links could not be saved in Notion.");
    }
    await response.body?.cancel();
  };
}
