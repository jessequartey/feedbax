import { IntegrationError } from "../contracts/integrations.ts";
import type { FetchFn, GitHubRepo, GitHubSetupClient } from "../contracts/integrations.ts";
import { createProviderRequest } from "./request.ts";

type Repository = { full_name: string; archived: boolean; has_issues: boolean };
export type GitHubIssue = {
  number: number;
  html_url: string;
  body: string | null;
  state: string;
  closed_at: string | null;
  updated_at: string;
  pull_request?: unknown;
  user?: { id: number };
};
const repoView = (repo: Repository): GitHubRepo => ({
  fullName: repo.full_name,
  archived: repo.archived,
  hasIssues: repo.has_issues,
});

export function githubRepoPath(fullName: string): string {
  if (
    !/^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/.test(fullName) ||
    fullName.split("/").some((part) => part === "." || part === "..")
  ) {
    throw new IntegrationError(
      "github",
      "schema",
      null,
      null,
      "GitHub repository must be owner/repo, not a URL.",
    );
  }
  return `/repos/${fullName}`;
}

export function createGitHubSetupClient(
  token: string,
  fetchFn: FetchFn = fetch,
): GitHubSetupClient {
  const request = createProviderRequest("github", token, fetchFn);
  return {
    me: () => request<{ login: string }>("/user"),
    async listRepos() {
      return (await request<Repository[]>("/user/repos?per_page=100&page=1")).map(repoView);
    },
    async checkRepo(fullName) {
      const path = githubRepoPath(fullName);
      const repo = await request<Repository>(path);
      if (repo.archived || !repo.has_issues) {
        throw new IntegrationError(
          "github",
          "permission",
          null,
          null,
          "Choose a repository that is not archived and has Issues enabled.",
        );
      }
      // Prove Issues write access without creating an issue: POST an invalid body (no
      // `title`). GitHub authorizes the request before validating it, so a token that can
      // write gets 422 "Validation Failed" and nothing is created; a token that cannot
      // gets 403 (or 404 when it cannot see the repository at all). 410 means Issues are off.
      try {
        await request(`${path}/issues`, "POST", {});
      } catch (error) {
        if (!(error instanceof IntegrationError) || error.provider !== "github") throw error;
        if (error.status === 422) return repoView(repo);
        if (error.status === 403 && error.kind === "permission") {
          throw new IntegrationError(
            "github",
            "permission",
            403,
            null,
            "github token cannot write Issues in this repository. Grant Issues: Read and write.",
          );
        }
        if (error.status === 404) {
          throw new IntegrationError(
            "github",
            "permission",
            404,
            null,
            "github token cannot write Issues in this repository. Grant Issues: Read and write and select this repository.",
          );
        }
        if (error.status === 410) {
          throw new IntegrationError(
            "github",
            "permission",
            410,
            null,
            "Issues are disabled for this repository.",
          );
        }
        throw error;
      }
      // A 2xx here would mean GitHub accepted an empty issue, which it never does.
      throw new IntegrationError(
        "github",
        "schema",
        null,
        null,
        "github returned an unexpected response while checking Issues write access.",
      );
    },
  };
}
