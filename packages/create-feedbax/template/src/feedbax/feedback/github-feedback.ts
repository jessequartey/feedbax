import { createHash, randomUUID } from "node:crypto";
import type { D1Database } from "@cloudflare/workers-types";
import type {
  FeedbackStorage,
  NewStoredPost,
  StoredPost,
} from "./feedback-storage";
import {
  BrowserCapabilityAuthorizationError,
  PublicPostCursorError,
  VoteEligibilityError,
  type PostStatus,
  type PostType,
} from "./index";
import {
  createGitHubClient,
  GitHubRateLimitError,
  isRecord,
  type GitHubAccessOptions,
} from "./github-request";

export interface GitHubFeedbackOptions extends GitHubAccessOptions {
  database: D1Database;
  votingEnabled?: boolean;
  commentsEnabled?: boolean;
}

interface Mapping {
  installation_id: string;
  repository_id: number;
  post_id: string;
  slug: string;
  external_id: string | null;
  issue_number: number | null;
  issue_id: number | null;
  record: string;
  state:
    "reserved" | "creating" | "ready" | "uncertain" | "failed" | "withdrawn";
  last_status: PostStatus;
  vote_count: number;
  projection_hash: string | null;
  public_updated_at: number | null;
}

const statuses = {
  "feedbax:new": "New",
  "feedbax:reviewing": "Reviewing",
  "feedbax:planned": "Planned",
  "feedbax:in-progress": "In Progress",
  "feedbax:shipped": "Shipped",
  "feedbax:closed": "Closed",
} as const;
const start = "<!-- feedbax:public:v1 -->";
const end = "<!-- /feedbax:public -->";

export function createGitHubFeedbackStorage(
  options: GitHubFeedbackOptions,
): FeedbackStorage {
  const { database, installationId, repository } = options;
  const { request, authorize, scan: scanAll } = createGitHubClient(options);
  const mapping = (field: "post_id" | "slug" | "external_id", value: string) =>
    database
      .prepare(
        `SELECT * FROM github_posts WHERE installation_id=? AND repository_id=? AND ${field}=?`,
      )
      .bind(installationId, repository.id, value)
      .first<Mapping>();
  const scan = async () =>
    (await scanAll()).filter((issue) => !issue.pull_request);
  const complete = async (row: Mapping, issue: Record<string, unknown>) => {
    if (
      !Number.isSafeInteger(issue.number) ||
      Number(issue.number) <= 0 ||
      !Number.isSafeInteger(issue.id) ||
      Number(issue.id) <= 0 ||
      !isRecord(issue.user) ||
      issue.user.id !== options.botUserId ||
      issue.pull_request ||
      !parseContent(issue.body, row.slug)
    )
      throw new Error("GitHub returned an invalid feedback issue.");
    await database
      .prepare(
        "UPDATE github_posts SET state='ready',issue_number=?,issue_id=? WHERE installation_id=? AND repository_id=? AND post_id=? AND state IN ('creating','uncertain')",
      )
      .bind(issue.number, issue.id, installationId, repository.id, row.post_id)
      .run();
    return storedPost({
      ...row,
      state: "ready",
      issue_number: Number(issue.number),
      issue_id: Number(issue.id),
    });
  };
  const recover = async (row: Mapping): Promise<StoredPost> => {
    await authorize();
    const candidates = (await scan()).filter(
      (issue) =>
        isRecord(issue.user) &&
        issue.user.id === options.botUserId &&
        parseContent(issue.body, row.slug),
    );
    if (candidates.length !== 1)
      throw new Error(
        "GitHub creation is pending reconciliation; no additional issue was created.",
      );
    return complete(row, candidates[0]!);
  };
  const issueFor = async (
    row: Mapping,
  ): Promise<Record<string, unknown> | undefined> => {
    await authorize();
    const response = await request(`/issues/${row.issue_number}`);
    if (response.status === 404 || response.status === 410) return;
    if (!response.ok)
      throw new Error(`GitHub read failed (${response.status}).`);
    const issue = (await response.json()) as Record<string, unknown>;
    if (issue.id !== row.issue_id || issue.pull_request) return;
    return issue;
  };
  const project = async (
    row: Mapping,
    issue: Record<string, unknown>,
    remember = true,
  ): Promise<StoredPost | undefined> => {
    const content = parseContent(issue.body, row.slug);
    if (!content) return;
    const labels = Array.isArray(issue.labels)
      ? issue.labels.map((label: unknown) =>
          typeof label === "string"
            ? label
            : isRecord(label)
              ? label.name
              : undefined,
        )
      : [];
    const matched = Object.entries(statuses).filter(([label]) =>
      labels.includes(label),
    );
    const status = matched.length === 1 ? matched[0]![1] : row.last_status;
    const stored = storedPost(row);
    const post: StoredPost = {
      ...stored,
      ...content,
      teamResponse: content.teamResponse,
      releaseNotesUrl: content.releaseNotesUrl,
      status,
      published: labels.includes("feedbax:published"),
      draftEditable:
        matched.length === 1 &&
        status === "New" &&
        !labels.includes("feedbax:published"),
    };
    const hash = projectionHash(post);
    const providerTime = Date.parse(String(issue.updated_at));
    const updatedAt =
      row.projection_hash === hash && row.public_updated_at !== null
        ? row.public_updated_at
        : Math.max(
            row.public_updated_at ?? 0,
            Number.isFinite(providerTime)
              ? providerTime
              : stored.updatedAt.getTime(),
          );
    if (remember) {
      const active = await database
        .prepare(
          "UPDATE github_posts SET last_status=?,projection_hash=?,public_updated_at=? WHERE installation_id=? AND repository_id=? AND post_id=? AND state='ready' RETURNING post_id",
        )
        .bind(
          status,
          hash,
          updatedAt,
          installationId,
          repository.id,
          row.post_id,
        )
        .first();
      if (!active) return;
    }
    return { ...post, updatedAt: new Date(updatedAt) };
  };
  const read = async (row: Mapping | null): Promise<StoredPost | undefined> => {
    if (!row || row.state !== "ready") return;
    const issue = await issueFor(row);
    return issue ? project(row, issue) : undefined;
  };
  const listSnapshot = async () => {
    await authorize();
    const issues = await scan();
    const byId = new Map(issues.map((issue) => [issue.id, issue]));
    const rows = await database
      .prepare(
        "SELECT * FROM github_posts WHERE installation_id=? AND repository_id=? AND state='ready' AND issue_id IN (SELECT value FROM json_each(?))",
      )
      .bind(
        installationId,
        repository.id,
        JSON.stringify(
          issues.map((issue) => issue.id).filter(Number.isSafeInteger),
        ),
      )
      .all<Mapping>();
    const projected = await Promise.all(
      rows.results.map(async (row) => {
        const issue = byId.get(row.issue_id);
        return issue ? project(row, issue, false) : undefined;
      }),
    );
    const posts = projected.filter((post): post is StoredPost => Boolean(post));
    if (posts.length) {
      const changes = JSON.stringify(
        posts.map((post) => ({
          id: post.id,
          status: post.status,
          hash: projectionHash(post),
          updatedAt: post.updatedAt.getTime(),
        })),
      );
      const active = await database
        .prepare(
          "UPDATE github_posts AS p SET last_status=json_extract(v.value,'$.status'),projection_hash=json_extract(v.value,'$.hash'),public_updated_at=json_extract(v.value,'$.updatedAt') FROM json_each(?) AS v WHERE p.post_id=json_extract(v.value,'$.id') AND p.installation_id=? AND p.repository_id=? AND p.state='ready' RETURNING post_id",
        )
        .bind(changes, installationId, repository.id)
        .all<{ post_id: string }>();
      const visible = new Set(active.results.map((row) => row.post_id));
      return posts.filter((post) => visible.has(post.id));
    }
    return posts;
  };
  const resume = async (row: Mapping): Promise<StoredPost> => {
    if (row.state === "ready") return (await read(row)) ?? storedPost(row);
    if (row.state === "withdrawn")
      return { ...storedPost(row), published: false, status: "Closed" };
    if (row.state === "failed")
      throw new Error(
        "GitHub creation was rejected; repair the original operation before retrying.",
      );
    if (row.state !== "reserved") return recover(row);
    await authorize();
    const claimed = await database
      .prepare(
        "UPDATE github_posts SET state='creating' WHERE installation_id=? AND repository_id=? AND post_id=? AND state='reserved' RETURNING *",
      )
      .bind(installationId, repository.id, row.post_id)
      .first<Mapping>();
    if (!claimed) return recover(row);
    let failureState = "uncertain";
    try {
      const item = storedPost(row);
      const response = await request("/issues", "POST", {
        title: item.title,
        body: serializeContent(item),
        labels: ["feedbax:new"],
      });
      if (!response.ok) {
        failureState =
          response.status === 429 ||
          (response.status === 403 &&
            (response.headers.has("Retry-After") ||
              response.headers.get("X-RateLimit-Remaining") === "0"))
            ? "reserved"
            : response.status >= 400 &&
                response.status < 500 &&
                response.status !== 408
              ? "failed"
              : "uncertain";
        throw new Error(`GitHub creation failed (${response.status}).`);
      }
      const issue = (await response.json()) as Record<string, unknown>;
      return await complete(row, issue);
    } catch (error) {
      if (error instanceof GitHubRateLimitError) failureState = "reserved";
      await database
        .prepare(
          "UPDATE github_posts SET state=? WHERE installation_id=? AND repository_id=? AND post_id=? AND state='creating'",
        )
        .bind(failureState, installationId, repository.id, row.post_id)
        .run();
      throw error;
    }
  };
  return {
    async create(item) {
      const row = await database
        .prepare(
          "INSERT INTO github_posts(installation_id,repository_id,post_id,slug,external_id,record,state) VALUES(?,?,?,?,?,?,'reserved') ON CONFLICT DO NOTHING RETURNING *",
        )
        .bind(
          installationId,
          repository.id,
          randomUUID(),
          item.slug,
          item.externalId ?? null,
          JSON.stringify(item),
        )
        .first<Mapping>();
      if (row) return resume(row);
      const existing = item.externalId
        ? await mapping("external_id", item.externalId)
        : null;
      if (existing) return resume(existing);
      throw new Error(
        "GitHub Post slug is already reserved; retry the submission.",
      );
    },
    find: async (id) => read(await mapping("post_id", id)),
    findBySlug: async (slug) => {
      const row = await mapping("slug", slug);
      if (!row) return;
      return (
        (await read(row)) ?? {
          ...storedPost(row),
          status: "Closed",
          published: false,
        }
      );
    },
    findPublicBySlug: async (slug) => {
      const post = await read(await mapping("slug", slug));
      return post?.published ? post : undefined;
    },
    findByExternalId: async (id) => {
      const row = await mapping("external_id", id);
      return row ? resume(row) : undefined;
    },
    async save(item) {
      const row = await mapping("post_id", item.id);
      const issue = row?.state === "ready" ? await issueFor(row) : undefined;
      const current = row && issue ? await project(row, issue) : undefined;
      if (
        !row ||
        !issue ||
        !current ||
        current.published ||
        current.draftEditable === false ||
        current.status !== "New"
      )
        throw new BrowserCapabilityAuthorizationError();
      const body = String(issue.body);
      const replacement =
        body.slice(0, body.indexOf(start)) +
        serializeContent({ ...item, slug: row.slug }, true) +
        body.slice(body.indexOf(end) + end.length);
      const response = await request(`/issues/${row.issue_number}`, "PATCH", {
        body: replacement,
      });
      if (!response.ok)
        throw new Error(`GitHub draft edit failed (${response.status}).`);
      const saved = {
        ...current,
        title: item.title,
        description: item.description,
        type: item.type,
        updatedAt: item.updatedAt,
      };
      await database
        .prepare(
          "UPDATE github_posts SET record=? WHERE installation_id=? AND repository_id=? AND post_id=? AND state='ready'",
        )
        .bind(JSON.stringify(saved), installationId, repository.id, row.post_id)
        .run();
      return saved;
    },
    async remove(id) {
      const row = await mapping("post_id", id);
      const current = await read(row);
      if (
        !row ||
        !current ||
        current.published ||
        current.draftEditable === false ||
        current.status !== "New"
      )
        throw new BrowserCapabilityAuthorizationError();
      // The tombstone revokes local visibility even if GitHub cleanup is interrupted.
      await database
        .prepare(
          "UPDATE github_posts SET state='withdrawn' WHERE installation_id=? AND repository_id=? AND post_id=?",
        )
        .bind(installationId, repository.id, id)
        .run();
      const response = await request(`/issues/${row.issue_number}`, "PATCH", {
        state: "closed",
      });
      if (!response.ok)
        throw new Error(
          `GitHub withdrawal cleanup failed (${response.status}); public visibility remains revoked.`,
        );
    },
    list: listSnapshot,
    async listPublic(query) {
      const matching = (await listSnapshot()).filter(
        (post) =>
          post.published &&
          (!query.type || post.type === query.type) &&
          (!query.status || post.status === query.status) &&
          (!query.types?.length || query.types.includes(post.type)) &&
          (!query.statuses?.length || query.statuses.includes(post.status)) &&
          (!query.search ||
            `${post.title}\n${post.description}`
              .toLowerCase()
              .includes(query.search.toLowerCase())),
      );
      matching.sort(
        (a, b) =>
          (query.sort === "new"
            ? 0
            : (b.voteCount ?? 0) - (a.voteCount ?? 0)) ||
          b.createdAt.getTime() - a.createdAt.getTime() ||
          b.id.localeCompare(a.id),
      );
      return paginate(matching, query.cursor);
    },
    async listPublicRoadmap(query) {
      const matching = (await listSnapshot()).filter(
        (post) => post.published && post.status === query.status,
      );
      matching.sort(
        (a, b) =>
          b.updatedAt.getTime() - a.updatedAt.getTime() ||
          b.id.localeCompare(a.id),
      );
      return {
        ...paginate(matching, query.cursor),
        totalCount: matching.length,
      };
    },
    async updateVoteCount(item, voteCount) {
      const current = await read(await mapping("post_id", item.id));
      if (!current?.published) throw new VoteEligibilityError();
      const value = Math.max(0, Math.trunc(voteCount));
      await database
        .prepare(
          "UPDATE github_posts SET vote_count=? WHERE installation_id=? AND repository_id=? AND post_id=? AND state='ready'",
        )
        .bind(value, installationId, repository.id, item.id)
        .run();
      return { ...current, voteCount: value };
    },
  };
}

function projectionHash(post: StoredPost) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        post.title,
        post.description,
        post.type,
        post.teamResponse ?? null,
        post.releaseNotesUrl ?? null,
        post.status,
        post.published,
      ]),
    )
    .digest("hex");
}

function paginate(items: StoredPost[], cursor?: string) {
  const id = cursor
    ? Buffer.from(cursor, "base64url").toString("utf8")
    : undefined;
  const index = id ? items.findIndex((post) => post.id === id) : -1;
  if (id && index === -1) throw new PublicPostCursorError();
  const page = items.slice(index + 1, index + 26);
  return {
    items: page,
    ...(index + 1 + page.length < items.length && page.length
      ? { nextCursor: Buffer.from(page.at(-1)!.id).toString("base64url") }
      : {}),
  };
}

function storedPost(row: Mapping): StoredPost {
  const value = JSON.parse(row.record) as NewStoredPost;
  return {
    ...value,
    id: row.post_id,
    slug: row.slug,
    createdAt: new Date(value.createdAt),
    updatedAt: new Date(value.updatedAt),
    status: row.last_status,
    voteCount: row.vote_count,
  };
}

function serializeContent(
  item: Pick<
    StoredPost,
    | "slug"
    | "title"
    | "description"
    | "type"
    | "teamResponse"
    | "releaseNotesUrl"
  >,
  preserveResponse = false,
) {
  return `${start}\n${JSON.stringify({
    slug: item.slug,
    title: item.title,
    description: item.description,
    type: item.type,
    ...(preserveResponse && item.teamResponse
      ? { teamResponse: item.teamResponse }
      : {}),
    ...(preserveResponse && safeLink(item.releaseNotesUrl)
      ? { releaseNotesUrl: item.releaseNotesUrl }
      : {}),
  }).replaceAll("<", "\\u003c")}\n${end}`;
}

function parseContent(
  body: unknown,
  slug: string,
):
  | {
      title: string;
      description: string;
      type: PostType;
      teamResponse?: string;
      releaseNotesUrl?: string;
    }
  | undefined {
  if (
    typeof body !== "string" ||
    body.split(start).length !== 2 ||
    body.split(end).length !== 2
  )
    return;
  const from = body.indexOf(start) + start.length;
  const to = body.indexOf(end);
  if (to < from) return;
  try {
    const value: unknown = JSON.parse(body.slice(from, to));
    if (
      !isRecord(value) ||
      value.slug !== slug ||
      typeof value.title !== "string" ||
      !value.title.trim() ||
      value.title.length > 160 ||
      typeof value.description !== "string" ||
      value.description.length > 5000 ||
      !["Feature Request", "Bug Report", "General Feedback"].includes(
        String(value.type),
      )
    )
      return;
    return {
      title: value.title,
      description: value.description,
      type: value.type as PostType,
      ...(typeof value.teamResponse === "string" &&
      value.teamResponse.length <= 5000
        ? { teamResponse: value.teamResponse }
        : {}),
      ...(safeLink(value.releaseNotesUrl)
        ? { releaseNotesUrl: String(value.releaseNotesUrl) }
        : {}),
    };
  } catch {
    return;
  }
}

function safeLink(value: unknown): boolean {
  if (
    typeof value !== "string" ||
    /[\\\s]/u.test(value) ||
    Array.from(value).some((character) => character.charCodeAt(0) < 32)
  )
    return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}
