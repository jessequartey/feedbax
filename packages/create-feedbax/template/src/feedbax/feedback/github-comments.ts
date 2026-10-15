import { createHash, randomUUID } from "node:crypto";
import type { CommentStorage, StoredComment } from "./comment-storage";
import type { FeedbackStorage } from "./feedback-storage";
import type { GitHubFeedbackOptions } from "./github-feedback";
import {
  createGitHubClient,
  GitHubRateLimitError,
  isRecord,
} from "./github-request";

interface CommentMapping {
  comment_id: string;
  post_id: string;
  discussion_id: string;
  remote_id: number | null;
  record: string;
  state: "creating" | "ready" | "uncertain" | "deleted";
}
const start = "<!-- feedbax:comment:v1 -->";
const end = "<!-- /feedbax:comment -->";

export function createGitHubCommentStorage(
  options: GitHubFeedbackOptions,
  posts: FeedbackStorage,
): CommentStorage {
  const { database, installationId, repository } = options;
  const { request, authorize, scan } = createGitHubClient(options);
  const rowFor = (id: string) =>
    database
      .prepare(
        "SELECT * FROM github_comments WHERE installation_id=? AND repository_id=? AND comment_id=?",
      )
      .bind(installationId, repository.id, id)
      .first<CommentMapping>();
  const postFor = async (id: string, requirePublished = true) => {
    const post = await posts.find(id);
    const row = await database
      .prepare(
        "SELECT issue_number FROM github_posts WHERE installation_id=? AND repository_id=? AND post_id=? AND state='ready'",
      )
      .bind(installationId, repository.id, id)
      .first<{ issue_number: number }>();
    if (!post || (requirePublished && !post.published) || !row)
      throw new Error("Post is unavailable.");
    return row;
  };
  const project = (
    row: CommentMapping,
    value: Record<string, unknown>,
  ): StoredComment | undefined => {
    if (
      !isRecord(value.user) ||
      value.user.id !== options.botUserId ||
      typeof value.body !== "string" ||
      (row.remote_id !== null && value.id !== row.remote_id) ||
      !Number.isSafeInteger(value.id)
    )
      return;
    const body = value.body;
    if (
      body.split(start).length !== 2 ||
      body.split(end).length !== 2 ||
      body.indexOf(end) < body.indexOf(start)
    )
      return;
    try {
      const content: unknown = JSON.parse(
        body.slice(body.indexOf(start) + start.length, body.indexOf(end)),
      );
      const createdAt = new Date(String(value.created_at));
      const original = JSON.parse(row.record) as { displayName: string };
      if (
        !isRecord(content) ||
        content.id !== row.comment_id ||
        content.discussionId !== row.discussion_id ||
        typeof content.body !== "string" ||
        !content.body.trim() ||
        content.body.length > 5000 ||
        content.displayName !== original.displayName ||
        !Number.isFinite(createdAt.getTime())
      )
        return;
      return {
        id: row.comment_id,
        postId: row.post_id,
        discussionId: row.discussion_id,
        body: content.body,
        author: { kind: "participant", displayName: original.displayName },
        createdAt,
        resolved: false,
        scope: "page",
      };
    } catch {
      return;
    }
  };
  const encode = (row: CommentMapping, body: string) =>
    `${start}\n${JSON.stringify({
      id: row.comment_id,
      discussionId: row.discussion_id,
      body,
      displayName: (JSON.parse(row.record) as { displayName: string })
        .displayName,
    }).replaceAll("<", "\\u003c")}\n${end}`;
  const complete = async (
    row: CommentMapping,
    value: Record<string, unknown>,
  ) => {
    const comment = project(row, value);
    if (!comment) throw new Error("GitHub returned an invalid portal Comment.");
    const result = await database
      .prepare(
        "UPDATE github_comments SET remote_id=?,state='ready' WHERE installation_id=? AND repository_id=? AND comment_id=? AND state IN('creating','uncertain')",
      )
      .bind(value.id, installationId, repository.id, row.comment_id)
      .run();
    if (result.meta.changes === 0) {
      const current = await rowFor(row.comment_id);
      if (current?.state !== "ready" || current.remote_id !== value.id)
        throw new Error("Comment is unavailable.");
    }
    return comment;
  };
  const list = async (postId: string) => {
    const post = await postFor(postId);
    const values = await scan(`/issues/${post.issue_number}/comments`);
    const rows = await database
      .prepare(
        "SELECT * FROM github_comments WHERE installation_id=? AND repository_id=? AND post_id=? AND state!='deleted'",
      )
      .bind(installationId, repository.id, postId)
      .all<CommentMapping>();
    const result: StoredComment[] = [];
    const remoteOrder = new Map<string, number>();
    for (const row of rows.results) {
      const matching = values.filter((value) => project(row, value));
      if (matching.length !== 1) continue;
      const value = matching[0]!;
      remoteOrder.set(row.comment_id, Number(value.id));
      result.push(
        row.state === "ready"
          ? project(row, value)!
          : await complete(row, value),
      );
    }
    result.sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        remoteOrder.get(a.id)! - remoteOrder.get(b.id)!,
    );
    return result;
  };
  const create = async (input: {
    submissionKey?: string;
    recoveryCommentId?: string;
    postId: string;
    discussionId?: string;
    body: string;
    displayName: string;
  }) => {
    const post = await postFor(input.postId);
    if (
      input.submissionKey !== undefined &&
      !/^[A-Za-z0-9_-]{43}$/.test(input.submissionKey)
    )
      throw new Error("Comment intent is invalid.");
    const digest = input.submissionKey
      ? createHash("sha256")
          .update(
            JSON.stringify([
              "feedbax-comment-intent-v1",
              installationId,
              repository.id,
              input.postId,
              input.discussionId ?? null,
              input.submissionKey,
            ]),
          )
          .digest("hex")
      : undefined;
    const id = digest
      ? `${digest.slice(0, 8)}-${digest.slice(8, 12)}-8${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`
      : randomUUID();
    if (input.recoveryCommentId && input.recoveryCommentId !== id)
      throw new Error("Images belong to another Comment intent.");
    let row: CommentMapping = {
      comment_id: id,
      post_id: input.postId,
      discussion_id: input.discussionId ?? id,
      remote_id: null,
      record: JSON.stringify({
        displayName: input.displayName,
        body: input.body,
      }),
      state: "creating",
    };
    const claimed = await database
      .prepare(
        "INSERT INTO github_comments(installation_id,repository_id,comment_id,post_id,discussion_id,record,state) VALUES(?,?,?,?,?,?,'creating') ON CONFLICT DO NOTHING RETURNING comment_id",
      )
      .bind(
        installationId,
        repository.id,
        id,
        row.post_id,
        row.discussion_id,
        row.record,
      )
      .first();
    if (!claimed) {
      const original = await rowFor(id);
      if (!original || original.state === "deleted")
        throw new Error("Comment is unavailable.");
      if (original.state === "ready") {
        const response = await request(
          `/issues/comments/${original.remote_id}`,
        );
        if (!response.ok) throw new Error("Comment is unavailable.");
        const comment = project(
          original,
          (await response.json()) as Record<string, unknown>,
        );
        if (!comment) throw new Error("Comment is unavailable.");
        return { ...comment, recoverable: true };
      }
      const retryAt = (JSON.parse(original.record) as { retryAt?: number })
        .retryAt;
      if (retryAt === undefined) {
        const candidates = (
          await scan(`/issues/${post.issue_number}/comments`)
        ).filter((value) => project(original, value));
        if (candidates.length !== 1)
          throw new Error(
            "Comment creation is pending reconciliation; do not start another intent.",
          );
        return {
          ...(await complete(original, candidates[0]!)),
          recoverable: true,
        };
      }
      if (retryAt > Date.now())
        throw new GitHubRateLimitError(retryAt - Date.now());
      const resumed = await database
        .prepare(
          "UPDATE github_comments SET state='creating',record=json_remove(record,'$.retryAt') WHERE installation_id=? AND repository_id=? AND comment_id=? AND state='uncertain' AND json_extract(record,'$.retryAt') <= ? RETURNING *",
        )
        .bind(installationId, repository.id, id, Date.now())
        .first<CommentMapping>();
      if (!resumed) throw new Error("Comment creation is already in progress.");
      row = resumed;
    }
    try {
      const response = await request(
        `/issues/${post.issue_number}/comments`,
        "POST",
        {
          body: encode(row, (JSON.parse(row.record) as { body: string }).body),
        },
      );
      if (
        response.status === 429 ||
        (response.status === 403 &&
          (response.headers.has("Retry-After") ||
            response.headers.get("X-RateLimit-Remaining") === "0"))
      ) {
        const after = response.headers.get("Retry-After");
        const reset = response.headers.get("X-RateLimit-Reset");
        const delay =
          after !== null
            ? Number.isFinite(Number(after))
              ? Number(after) * 1000
              : Date.parse(after) - Date.now()
            : reset
              ? Number(reset) * 1000 - Date.now()
              : 1000;
        throw new GitHubRateLimitError(
          Number.isFinite(delay) ? Math.max(0, delay) : 1000,
        );
      }
      if (!response.ok)
        throw new Error(`GitHub Comment creation failed (${response.status}).`);
      return {
        ...(await complete(
          row,
          (await response.json()) as Record<string, unknown>,
        )),
        recoverable: Boolean(input.submissionKey),
      };
    } catch (error) {
      await database
        .prepare(
          "UPDATE github_comments SET state='uncertain',record=CASE WHEN ? IS NULL THEN record ELSE json_set(record,'$.retryAt',?) END WHERE installation_id=? AND repository_id=? AND comment_id=? AND state='creating'",
        )
        .bind(
          error instanceof GitHubRateLimitError
            ? Date.now() + error.retryAfterMs
            : null,
          error instanceof GitHubRateLimitError
            ? Date.now() + error.retryAfterMs
            : null,
          installationId,
          repository.id,
          id,
        )
        .run();
      throw error;
    }
  };
  return {
    supportsIntentRecovery: true,
    createPageComment: create,
    createDiscussionReply: create,
    async listPageComments(postId, cursor) {
      const comments = await list(postId);
      let offset = 0;
      if (cursor) {
        try {
          const parsed = JSON.parse(
            Buffer.from(cursor, "base64url").toString("utf8"),
          );
          if (
            parsed.post !== postId ||
            !Number.isSafeInteger(parsed.offset) ||
            parsed.offset < 0
          )
            throw new Error();
          offset = parsed.offset;
        } catch {
          throw new Error("Invalid GitHub Comment cursor.");
        }
      }
      return {
        items: comments.slice(offset, offset + 50),
        ...(offset + 50 < comments.length
          ? {
              nextCursor: Buffer.from(
                JSON.stringify({ post: postId, offset: offset + 50 }),
              ).toString("base64url"),
            }
          : {}),
      };
    },
    async updateComment(id, body) {
      const row = await rowFor(id);
      if (!row || row.state !== "ready")
        throw new Error("Comment is unavailable.");
      await postFor(row.post_id);
      const response = await request(`/issues/comments/${row.remote_id}`);
      if (!response.ok) throw new Error("Comment is unavailable.");
      const value = (await response.json()) as Record<string, unknown>;
      if (!project(row, value)) throw new Error("Comment is unavailable.");
      const previous = String(value.body);
      const replacement =
        previous.slice(0, previous.indexOf(start)) +
        encode(row, body) +
        previous.slice(previous.indexOf(end) + end.length);
      const updated = await request(
        `/issues/comments/${row.remote_id}`,
        "PATCH",
        { body: replacement },
      );
      if (!updated.ok)
        throw new Error(`GitHub Comment edit failed (${updated.status}).`);
      const projected = project(
        row,
        (await updated.json()) as Record<string, unknown>,
      );
      if (!projected)
        throw new Error("GitHub returned an invalid portal Comment.");
      return projected;
    },
    async deleteComment(id) {
      const row = await rowFor(id);
      if (!row || !row.remote_id) throw new Error("Comment is unavailable.");
      await authorize();
      await database
        .prepare(
          "UPDATE github_comments SET state='deleted' WHERE installation_id=? AND repository_id=? AND comment_id=?",
        )
        .bind(installationId, repository.id, id)
        .run();
      const response = await request(
        `/issues/comments/${row.remote_id}`,
        "DELETE",
      );
      if (!response.ok && response.status !== 404)
        throw new Error(`GitHub Comment cleanup failed (${response.status}).`);
    },
  };
}
