import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import type { PublicPostPage } from "@feedbax/feedback";
import { describe, expect, it, vi } from "vitest";

import { publicPostsQuery } from "./post-queries";

vi.mock("./public-feedback-server-function", () => ({
  getPublicFeedbackPage: vi.fn(),
}));

describe("public Posts query", () => {
  it("reuses the loader page and retains it when another cursor page loads", async () => {
    const pages: Record<string, PublicPostPage> = {
      first: {
        items: [post("first-post")],
        nextCursor: "opaque-cursor",
      },
      "opaque-cursor": { items: [post("second-post")] },
    };
    const fetchPage = vi.fn(async ({ cursor }: { cursor?: string }) =>
      cursor ? pages[cursor]! : pages.first!,
    );
    const client = new QueryClient();
    const options = publicPostsQuery({ sort: "trending" }, fetchPage);

    await client.ensureInfiniteQueryData(options);
    expect(fetchPage).toHaveBeenCalledTimes(1);

    const observer = new InfiniteQueryObserver(client, options);
    await observer.fetchNextPage();

    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(client.getQueryData(options.queryKey)).toMatchObject({
      pages: [pages.first, pages["opaque-cursor"]],
      pageParams: [undefined, "opaque-cursor"],
    });
  });
});

function post(slug: string) {
  return {
    slug,
    title: slug,
    description: `${slug} description`,
    type: "Feature Request" as const,
    status: "New" as const,
    createdAt: new Date("2026-08-22T10:00:00.000Z"),
    updatedAt: new Date("2026-08-22T10:00:00.000Z"),
  };
}
