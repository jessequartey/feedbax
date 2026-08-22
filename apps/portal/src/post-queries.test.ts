import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import type { PublicPostPage } from "@feedbax/feedback";
import { describe, expect, it, vi } from "vitest";

import { publicPostsQuery } from "./post-queries";
import { authorizedDraftPostsQuery } from "./authorized-draft-query";
import { capabilitiesKey, readCapabilities } from "./browser-post-state";

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

describe("authorized Draft Posts query", () => {
  it("keeps Browser Capability secrets out of its key and cached result", async () => {
    const secret = "private-browser-capability";
    const capabilities = {
      "draft-id": {
        id: "draft-id",
        slug: "private-draft",
        browserCapability: secret,
      },
    };
    const fetchDraft = vi.fn(async () => draft("draft-id"));
    const client = new QueryClient();
    const options = authorizedDraftPostsQuery(capabilities, fetchDraft);

    await client.ensureQueryData(options);

    expect(fetchDraft).toHaveBeenCalledWith({
      data: {
        id: "draft-id",
        slug: "private-draft",
        browserCapability: secret,
      },
    });
    expect(JSON.stringify(options.queryKey)).not.toContain(secret);
    expect(JSON.stringify(client.getQueryData(options.queryKey))).not.toContain(
      secret,
    );
  });

  it("removes only capabilities proven invalid while retaining valid drafts", async () => {
    const storage = memoryStorage({
      [capabilitiesKey]: JSON.stringify({
        valid: {
          id: "valid",
          slug: "valid-draft",
          browserCapability: "valid-secret",
        },
        expired: {
          id: "expired",
          slug: "expired-draft",
          browserCapability: "expired-secret",
        },
      }),
    });
    const fetchDraft = vi.fn(async ({ data }: { data: { id: string } }) => {
      if (data.id === "expired") {
        throw new Error("Browser Capability did not authorize this draft.");
      }
      return draft(data.id);
    });
    const client = new QueryClient();

    const drafts = await client.ensureQueryData(
      authorizedDraftPostsQuery(readCapabilities(storage), fetchDraft, storage),
    );

    expect(drafts.map((item) => item.id)).toEqual(["valid"]);
    expect(Object.keys(readCapabilities(storage))).toEqual(["valid"]);
  });

  it("keeps cached drafts visible when a private retrieval fails transiently", async () => {
    const capabilities = {
      valid: {
        id: "valid",
        slug: "valid-draft",
        browserCapability: "valid-secret",
      },
    };
    const options = authorizedDraftPostsQuery(capabilities, async () => {
      throw new Error("Post service unavailable");
    });
    const cached = [draft("valid")];
    const client = new QueryClient();
    client.setQueryData(options.queryKey, cached);
    await client.invalidateQueries({ queryKey: options.queryKey });

    await expect(client.fetchQuery(options)).rejects.toThrow(
      "Post service unavailable",
    );

    expect(client.getQueryData(options.queryKey)).toEqual(cached);
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

function draft(id: string) {
  return {
    id,
    slug: `${id}-draft`,
    title: `${id} draft`,
    description: `${id} description`,
    type: "Feature Request" as const,
    status: "New" as const,
    submitter: {},
    createdAt: new Date("2026-08-22T10:00:00.000Z"),
    updatedAt: new Date("2026-08-22T10:00:00.000Z"),
  };
}

function memoryStorage(initial: Record<string, string>) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}
