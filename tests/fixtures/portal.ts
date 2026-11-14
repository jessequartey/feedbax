// Deterministic fixture data and fixture implementations of PortalFunctions.
// Used by the W0 server-function stub, by W3 (portal UI) and by W4 (block) before W1 lands.
import type {
  ApiResult,
  Category,
  CommentView,
  CreatePostResult,
  ImageView,
  ListPostsInput,
  Page,
  PostDetail,
  PostSummary,
  PublicAuthor,
  RoadmapResult,
  Sort,
  Status,
  ViewerUser,
  VoteResult,
} from "../../src/contracts/domain.ts";
import type { PublicConfig } from "../../src/contracts/config.ts";
import type { Viewer } from "../../src/contracts/portal.ts";

export const FIXTURE_NOW = Date.parse("2026-11-01T12:00:00.000Z");
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
export const fixtureId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

export const accountUser: ViewerUser = {
  id: fixtureId(9001),
  name: "Ada Lovelace",
  kind: "account",
};
export const hostUser: ViewerUser = { id: fixtureId(9002), name: "Grace Hopper", kind: "host" };
export const anonymousUser: ViewerUser = {
  id: fixtureId(9003),
  name: "Anonymous",
  kind: "anonymous",
};
export const fixtureUsers = [accountUser, hostUser, anonymousUser] as const;

export const authorOf = (u: ViewerUser): PublicAuthor => ({
  id: u.id,
  name: u.kind === "anonymous" ? "Anonymous" : u.name,
  anonymous: u.kind === "anonymous",
});

export const publicConfig: PublicConfig = {
  name: "Feedbax",
  appUrl: "https://app.example.com",
  anonymous: true,
  oauth: { github: true, google: false },
};

export const STATUSES: readonly Status[] = ["open", "planned", "in_progress", "done", "closed"];
export const CATEGORIES: readonly Category[] = ["feature", "bug", "general"];

export const fixtureImages: ImageView[] = [
  { id: fixtureId(7001), url: "/api/media/" + fixtureId(7001), width: 1280, height: 720 },
  { id: fixtureId(7002), url: "/api/media/" + fixtureId(7002), width: 800, height: 1200 },
];

function excerptOf(body: string): string {
  const flat = body.replace(/\s+/g, " ").trim();
  const chars = Array.from(flat);
  return chars.length > 180 ? `${chars.slice(0, 180).join("")}…` : flat;
}

type Row = PostDetail & { voted: boolean };
function makePost(n: number, over: Partial<Row> = {}): Row {
  const status = over.status ?? STATUSES[n % STATUSES.length]!;
  const category = over.category ?? CATEGORIES[n % CATEGORIES.length]!;
  const author = authorOf(fixtureUsers[n % fixtureUsers.length]!);
  const body =
    over.body ?? `Fixture post ${n}.\nA description with some detail about request number ${n}.`;
  const createdMs = FIXTURE_NOW - n * 5 * HOUR;
  return {
    id: fixtureId(n),
    title: `Fixture post ${n}`,
    excerpt: excerptOf(body),
    category,
    status,
    author,
    votes: (n * 7) % 23,
    comments: n % 4,
    viewerHasVoted: false,
    createdAt: iso(createdMs),
    updatedAt: iso(createdMs + HOUR),
    body,
    images: [],
    githubUrl: null,
    voted: false,
    ...over,
  };
}

/** 45 posts: every status and category appears, newest first by id. More than two pages at limit 20. */
export const fixturePosts: Row[] = Array.from({ length: 45 }, (_, i) => makePost(i + 1));
// Post 3 carries two images and a GitHub link; post 4 is anonymous-authored and long.
fixturePosts[2] = makePost(3, {
  title: "Dark mode for the dashboard",
  category: "feature",
  status: "in_progress",
  images: fixtureImages,
  githubUrl: "https://github.com/example/repo/issues/42",
  votes: 31,
  comments: 3,
});
fixturePosts[3] = makePost(4, {
  title: "Anonymous bug report with a long description",
  category: "bug",
  status: "open",
  author: authorOf(anonymousUser),
  body: "x".repeat(400) + " — a very long description that must be cut into an excerpt.",
});

const summaryOf = (r: Row): PostSummary => ({
  id: r.id,
  title: r.title,
  excerpt: r.excerpt,
  category: r.category,
  status: r.status,
  author: r.author,
  votes: r.votes,
  comments: r.comments,
  viewerHasVoted: r.viewerHasVoted,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});
const detailOf = ({ voted: _voted, ...rest }: Row): PostDetail => rest;

export const fixtureComments: CommentView[] = Array.from({ length: 26 }, (_, i) => ({
  id: fixtureId(5000 + i),
  postId: fixtureId(3),
  author: authorOf(fixtureUsers[i % fixtureUsers.length]!),
  body: `Fixture comment ${i + 1}`,
  createdAt: iso(FIXTURE_NOW - (30 - i) * HOUR),
}));

function paginate<T>(all: T[], page = 1, limit = 20): Page<T> {
  const l = Math.min(Math.max(limit, 1), 50);
  const p = Math.max(page, 1);
  const items = all.slice((p - 1) * l, p * l);
  return { items, page: p, limit: l, total: all.length, hasMore: p * l < all.length };
}

function sortRows(rows: Row[], sort: Sort = "trending"): Row[] {
  const byNew = (a: Row, b: Row) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : -1;
  return [...rows].sort(sort === "new" ? byNew : (a, b) => b.votes - a.votes || byNew(a, b));
}

export function filterRows(input: ListPostsInput, rows: Row[] = fixturePosts): Row[] {
  const q = input.q?.trim().toLowerCase();
  return rows.filter(
    (r) =>
      (!input.category || r.category === input.category) &&
      (!input.status || r.status === input.status) &&
      (!q || r.title.toLowerCase().includes(q) || r.body.toLowerCase().includes(q)),
  );
}

export const fixtureViewer: Viewer = { user: accountUser, config: publicConfig };
export const signedOutViewer: Viewer = { user: null, config: publicConfig };

export function fixtureListPosts(input: ListPostsInput): Page<PostSummary> {
  const rows = sortRows(filterRows(input), input.sort);
  const page = paginate(rows, input.page, input.limit);
  return { ...page, items: page.items.map(summaryOf) };
}
export function fixtureListMyPosts(input: ListPostsInput): Page<PostSummary> {
  const mine = filterRows(input).filter((r) => r.author.id === accountUser.id);
  const page = paginate(sortRows(mine, input.sort ?? "new"), input.page, input.limit);
  return { ...page, items: page.items.map(summaryOf) };
}
export function fixtureGetPost(id: string): PostDetail | null {
  const row = fixturePosts.find((r) => r.id === id);
  return row ? detailOf(row) : null;
}
export function fixtureListComments(postId: string, page = 1): Page<CommentView> {
  return paginate(
    fixtureComments.filter((c) => c.postId === postId),
    page,
    20,
  );
}
export function fixtureRoadmap(input: { q?: string; category?: Category }): RoadmapResult {
  const column = (status: "planned" | "in_progress" | "done") => {
    const rows = sortRows(filterRows({ ...input, status }), "top");
    return { items: rows.slice(0, 20).map(summaryOf), total: rows.length };
  };
  return { planned: column("planned"), in_progress: column("in_progress"), done: column("done") };
}
function formString(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
}
export function fixtureCreatePost(data: FormData): ApiResult<CreatePostResult> {
  const id = formString(data, "id");
  const title = formString(data, "title");
  if (!id)
    return { ok: false, error: { code: "invalid_input", message: "id is required", field: "id" } };
  if (!title)
    return {
      ok: false,
      error: { code: "invalid_input", message: "title is required", field: "title" },
    };
  return { ok: true, data: { postId: id, postUrl: `http://localhost:3000/posts/${id}` } };
}
export function fixtureAddComment(input: {
  id: string;
  postId: string;
  body: string;
}): ApiResult<CommentView> {
  return {
    ok: true,
    data: {
      id: input.id,
      postId: input.postId,
      author: authorOf(accountUser),
      body: input.body,
      createdAt: iso(FIXTURE_NOW),
    },
  };
}
export function fixtureSetVote(input: { postId: string; voted: boolean }): ApiResult<VoteResult> {
  const row = fixturePosts.find((r) => r.id === input.postId);
  if (!row) return { ok: false, error: { code: "not_found", message: "Post not found" } };
  return {
    ok: true,
    data: { votes: row.votes + (input.voted ? 1 : 0), viewerHasVoted: input.voted },
  };
}
