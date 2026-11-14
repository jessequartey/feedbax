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
      // GitHub offers no read-only endpoint proving a PAT's Issues write permission.
      // Do not create a test issue: the first approved issue verifies write access.
      await request(`${path}/issues?state=all&per_page=1`);
      return repoView(repo);
    },
  };
}
