import { IntegrationError } from "../contracts/integrations.ts";
import { githubRepoPath } from "./github.ts";
import type { ProviderRequest } from "./request.ts";

export type GitHubRelease = {
  id: number;
  name: string | null;
  tag_name: string;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
};

export function parseRelease(value: unknown): GitHubRelease {
  const r = value as GitHubRelease | null;
  if (
    !r ||
    !Number.isSafeInteger(r.id) ||
    r.id <= 0 ||
    typeof r.tag_name !== "string" ||
    !r.tag_name.trim() ||
    (r.name !== null && typeof r.name !== "string") ||
    (r.body !== null && typeof r.body !== "string") ||
    typeof r.draft !== "boolean" ||
    typeof r.prerelease !== "boolean" ||
    (r.published_at !== null &&
      (typeof r.published_at !== "string" || !Number.isFinite(Date.parse(r.published_at))))
  )
    throw new IntegrationError("github", "schema", null, null, "Invalid GitHub release.");
  return r;
}

/** Fixed API origin and validated repo; no API-provided URLs are followed. */
export function githubReleases(request: ProviderRequest, repo: string) {
  const path = `${githubRepoPath(repo)}/releases`;
  return {
    async get(id: number): Promise<GitHubRelease | null> {
      const response = await request<Response>(`${path}/${id}`, "GET", undefined, {
        raw: true,
        acceptStatuses: [404],
      });
      if (response.status === 404) {
        await response.body?.cancel();
        return null;
      }
      return parseRelease(await response.json());
    },
    async list(page: number, etag?: string) {
      const response = await request<Response>(
        `${path}?per_page=5&page=${page}`,
        "GET",
        undefined,
        { raw: true, acceptStatuses: [304], headers: etag ? { "If-None-Match": etag } : {} },
      );
      if (response.status === 304) {
        await response.body?.cancel();
        return { unchanged: true as const };
      }
      const data: unknown = await response.json();
      if (!Array.isArray(data))
        throw new IntegrationError("github", "schema", null, null, "Invalid GitHub releases list.");
      return {
        unchanged: false as const,
        releases: data.map(parseRelease),
        etag: response.headers.get("etag") ?? undefined,
        next: /rel="next"/.test(response.headers.get("link") ?? ""),
      };
    },
  };
}
