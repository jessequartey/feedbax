import { and, eq, inArray, isNull, sql } from "drizzle-orm";
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

import { authenticMarker, issueMarker } from "./github-marker.ts";
import type { ProviderRequest } from "../integrations/request.ts";
import { queueEmails, statusEmails } from "../email/events.ts";
import { richText } from "../server/rich-text.ts";
let actor: { token: string; id: number } | undefined;
async function actorId(request: ProviderRequest): Promise<number> {
  if (actor && actor.token === env.GITHUB_TOKEN) return actor.id;
  const user = await request<{ id: number }>("/user");
  if (!Number.isSafeInteger(user.id)) throw new Error("Invalid GitHub identity");
  actor = { token: env.GITHUB_TOKEN!, id: user.id };
  return user.id;
}
function escapeMarkdown(text: string): string {
  return text
    .replaceAll("@", "@\u200b")
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
  let issue: GitHubIssue | undefined;
  const candidates: GitHubIssue[] = [];
  for (const candidate of recent)
    if (!candidate.pull_request && (await authenticMarker(candidate.body, postId)))
      candidates.push(candidate);
  if (candidates.length) {
    // The HMAC prevents pre-approval forgery. Immutable creator identity also rejects
    // outsiders copying a genuine marker after a lost response. Only recovery costs
    // the identity request, cached for this token within the isolate.
    const creator = await actorId(request);
    issue = candidates.find((candidate) => candidate.user?.id === creator);
  }
  if (!issue) {
    const body = [
      escapeMarkdown(post.body),
      `Category: ${CATEGORY_LABELS[post.category]}`,
      `[View feedback](${portalUrl()}/posts/${post.id})`,
      ...post.images.map(
        (image) => `[Image ${image.position + 1}](${portalUrl()}/api/media/${image.id})`,
      ),
      await issueMarker(postId),
    ].join("\n\n");
    issue = await request<GitHubIssue>(path, "POST", { title: post.title, body });
  }
  if (!Number.isSafeInteger(issue.user?.id)) throw new Error("Invalid GitHub issue creator");
  const closedAt =
    issue.state === "closed" ? Date.parse(issue.closed_at ?? issue.updated_at) : null;
  const closes = closedAt !== null && Number.isFinite(closedAt);
  const linked = await database
    .update(posts)
    .set({
      githubNumber: issue.number,
      githubCreatorId: issue.user!.id,
      githubUrl: issue.html_url,
      revision: sql`${posts.revision} + 1`,
      updatedAt: Date.now(),
      ...(closes ? { githubClosedAt: closedAt, status: "done" as const } : {}),
    })
    .where(and(eq(posts.id, postId), isNull(posts.githubNumber)))
    .returning({ id: posts.id });
  if (closes && linked.length && post.status !== "done")
    await queueEmails(
      statusEmails([
        {
          post: { id: post.id, title: post.title, body: richText(post.body) },
          from: post.status,
          to: "done",
        },
      ]),
    );
}

export async function pollGitHub(
  message: Extract<SyncMessage, { type: "github.poll" }>,
): Promise<void> {
  if (!config.integrations.github) return;
  const database = db();
  const request = providerRequest("github", "poll");
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
  const closed = issues.filter(
    (issue) =>
      !issue.pull_request &&
      issue.state === "closed" &&
      Date.parse(issue.updated_at) <= Date.parse(message.until),
  );
  const linked = closed.length
    ? await database
        .select({
          id: posts.id,
          number: posts.githubNumber,
          creator: posts.githubCreatorId,
          status: posts.status,
          title: posts.title,
          body: posts.body,
        })
        .from(posts)
        .where(
          and(
            inArray(
              posts.githubNumber,
              closed.map((issue) => issue.number),
            ),
            isNull(posts.githubClosedAt),
          ),
        )
    : [];
  const verified: GitHubIssue[] = [];
  for (const issue of closed) {
    const post = linked.find((post) => post.number === issue.number);
    if (!post) continue;
    if (post.creator !== null) {
      if (issue.user?.id === post.creator) verified.push(issue);
    } else if (await authenticMarker(issue.body, post.id)) {
      // Legacy linkage was not authenticated when saved. Require both proofs once.
      if (issue.user?.id === (await actorId(request))) verified.push(issue);
    }
  }
  const updates = verified.flatMap((issue) => {
    const closedAt = Date.parse(issue.closed_at ?? issue.updated_at);
    if (!Number.isFinite(closedAt)) return [];
    return [
      database
        .update(posts)
        .set({
          status: "done",
          githubClosedAt: closedAt,
          githubCreatorId: issue.user!.id,
          updatedAt: Date.now(),
          revision: sql`${posts.revision} + 1`,
        })
        .where(and(eq(posts.githubNumber, issue.number), isNull(posts.githubClosedAt))),
    ];
  });
  if (updates.length) {
    await database.batch(updates as [(typeof updates)[number], ...typeof updates]);
    // Closed issues set Done. Best effort, after the batch; never fails the poll.
    await queueEmails(
      statusEmails(
        verified.flatMap((issue) => {
          const post = linked.find((post) => post.number === issue.number);
          return post && post.status !== "done"
            ? [
                {
                  post: { id: post.id, title: post.title, body: richText(post.body) },
                  from: post.status,
                  to: "done" as const,
                },
              ]
            : [];
        }),
      ),
    );
  }
  if (
    issues.length === 100 &&
    Date.parse(issues[issues.length - 1]!.updated_at) <= Date.parse(message.until)
  )
    await env.SYNC_QUEUE.send({ ...message, page: message.page + 1 });
  else await watermark("github", message.until);
}
