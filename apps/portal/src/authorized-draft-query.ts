import { queryOptions } from "@tanstack/react-query";
import type { DraftPost } from "@feedbax/feedback";

import {
  removeCapability,
  type StoredPostCapability,
} from "./browser-post-state";

type FetchAuthorizedDraft = (input: {
  data: StoredPostCapability;
}) => Promise<DraftPost>;

type CapabilityStorage = Pick<Storage, "getItem" | "setItem">;

export const authorizedDraftPostsQueryRoot = [
  "authorized-draft-posts",
] as const;

export function authorizedDraftPostsQueryKey(
  capabilities: Record<string, StoredPostCapability>,
) {
  return [
    ...authorizedDraftPostsQueryRoot,
    Object.keys(capabilities).sort(),
  ] as const;
}

export function authorizedDraftPostsQuery(
  capabilities: Record<string, StoredPostCapability>,
  fetchDraft: FetchAuthorizedDraft,
  storage?: CapabilityStorage,
) {
  const entries = Object.values(capabilities);
  return queryOptions({
    queryKey: authorizedDraftPostsQueryKey(capabilities),
    queryFn: async () => {
      const results = await Promise.allSettled(
        entries.map(async (capability) => ({
          post: await fetchDraft({ data: capability }),
        })),
      );
      const drafts: DraftPost[] = [];
      let transientFailure: unknown;
      for (const [index, result] of results.entries()) {
        if (result.status === "fulfilled") {
          drafts.push(result.value.post);
          continue;
        }
        const capability = entries[index];
        if (storage && capability && isAuthorizationFailure(result.reason)) {
          removeCapability(storage, capability.id);
        } else {
          transientFailure = result.reason;
        }
      }
      if (transientFailure) throw transientFailure;
      return drafts.sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() -
            new Date(left.updatedAt).getTime() ||
          right.id.localeCompare(left.id),
      );
    },
    staleTime: 30_000,
  });
}

function isAuthorizationFailure(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "BrowserCapabilityAuthorizationError" ||
      error.message.includes("did not authorize"))
  );
}
