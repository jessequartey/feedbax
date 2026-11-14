import { and, eq, isNull, sql } from "drizzle-orm";
import { CATEGORY_LABELS } from "../contracts/domain.ts";
import type { SyncMessage } from "../contracts/sync.ts";
import { githubRepoPath } from "../integrations/github.ts";
import type { GitHubIssue } from "../integrations/github.ts";
import {
  config,
  db,
  portalUrl,
  posts,
  providerRequest,
  readPost,
  watermark,
  env,
} from "./shared.ts";

export const issueMarker = (postId: string) => `<!-- feedbax:${postId} -->`;
function escapeMarkdown(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/[\\`*_{}[\]()#+\-.!|~]/g, "\\$&");
}

export async function createIssue(postId: string): Promise<void> {
  if (!config.integrations.github) return;
  const post = await readPost(postId);
  if (!post || !post.githubRequested || post.githubNumber !== null) return;
  const database = db();
  const request = providerRequest("github");
  const path = `${githubRepoPath(config.integrations.github.repo)}/issues`;
  const recent = await request<GitHubIssue[]>(
    `${path}?state=all&sort=created&direction=desc&per_page=30`,
  );
  let issue = recent.find(
    (issue) => !issue.pull_request && issue.body?.includes(issueMarker(postId)),
  );
  if (!issue) {
    const body = [
      escapeMarkdown(post.body),
      `Category: ${CATEGORY_LABELS[post.category]}`,
      `[View feedback](${portalUrl()}/posts/${post.id})`,
      ...post.images.map(
        (image) => `[Image ${image.position + 1}](${portalUrl()}/api/media/${image.id})`,
      ),
      issueMarker(postId),
    ].join("\n\n");
    issue = await request<GitHubIssue>(path, "POST", { title: post.title, body });
  }
  const closedAt =
    issue.state === "closed" ? Date.parse(issue.closed_at ?? issue.updated_at) : null;
  await database
    .update(posts)
    .set({
      githubNumber: issue.number,
      githubUrl: issue.html_url,
      revision: sql`${posts.revision} + 1`,
      updatedAt: Date.now(),
      ...(closedAt !== null && Number.isFinite(closedAt)
        ? { githubClosedAt: closedAt, status: "done" as const }
        : {}),
    })
    .where(and(eq(posts.id, postId), isNull(posts.githubNumber)));
}

export async function pollGitHub(
  message: Extract<SyncMessage, { type: "github.poll" }>,
): Promise<void> {
  if (!config.integrations.github) return;
  const database = db();
  const request = providerRequest("github");
  const path = `${githubRepoPath(config.integrations.github.repo)}/issues`;
  const query = new URLSearchParams({
    state: "closed",
    sort: "updated",
    direction: "asc",
    since: message.since,
    per_page: "100",
    page: String(message.page),
  });
  const issues = await request<GitHubIssue[]>(`${path}?${query}`);
  const updates = issues
    .filter(
      (issue) =>
        !issue.pull_request &&
        issue.state === "closed" &&
        Date.parse(issue.updated_at) <= Date.parse(message.until),
    )
    .flatMap((issue) => {
      const closedAt = Date.parse(issue.closed_at ?? issue.updated_at);
      if (!Number.isFinite(closedAt)) return [];
      return [
        database
          .update(posts)
          .set({
            status: "done",
            githubClosedAt: closedAt,
            updatedAt: Date.now(),
            revision: sql`${posts.revision} + 1`,
          })
          .where(and(eq(posts.githubNumber, issue.number), isNull(posts.githubClosedAt))),
      ];
    });
  if (updates.length)
    await database.batch(updates as [(typeof updates)[number], ...typeof updates]);
  if (issues.length === 100) await env.SYNC_QUEUE.send({ ...message, page: message.page + 1 });
  else await watermark("github", message.until);
}
