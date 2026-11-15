export type Category = "feature" | "bug" | "general";
export type Status = "open" | "planned" | "in_progress" | "done" | "closed";
export type Sort = "new" | "top" | "trending" | "priority";
export const CATEGORY_LABELS: Record<Category, string> = {
  feature: "Feature request",
  bug: "Bug report",
  general: "General feedback",
};
export const STATUS_LABELS: Record<Status, string> = {
  open: "Open",
  planned: "Planned",
  in_progress: "In progress",
  done: "Done",
  closed: "Closed",
};
export const LIMITS = {
  title: 120,
  body: 5000,
  comment: 2000,
  images: 3,
  imageBytes: 5_242_880,
  imageSide: 4096,
  imagePixels: 16_000_000,
  postsPerHour: 5,
  commentsPerHour: 30,
} as const;

export type PublicAuthor = { id: string; name: string; anonymous: boolean };
export type ViewerUser = {
  id: string;
  name: string;
  kind: "account" | "host" | "anonymous";
  /** Present (true) only for admins. */
  admin?: boolean;
  /** Present (true) only for banned users: they can read but not post, vote or comment. */
  banned?: boolean;
};
export type ImageView = { id: string; url: string; width: number; height: number };
export type PostSummary = {
  id: string;
  title: string;
  excerpt: string;
  category: Category;
  status: Status;
  author: PublicAuthor;
  votes: number;
  comments: number;
  viewerHasVoted: boolean;
  createdAt: string;
  updatedAt: string;
  /** True only in lists and pages the author or an admin can see: hidden or spam. */
  hidden?: true;
};
export type PostDetail = PostSummary & {
  /** Included only for authenticated admins. */
  priority?: number | null;
  /** Whether the signed-in non-anonymous viewer follows this post. */
  viewerIsFollowing?: boolean;
  body: string;
  images: ImageView[];
  githubUrl: string | null;
  /** Set on a merged duplicate: the page redirects to this post. */
  mergedInto?: string;
  /** Published changelog entries that link this post ("Shipped in …"). Present only when any. */
  shippedIn?: { id: string; title: string }[];
};
export type CommentView = {
  /** Present on a held submission returned to its author. */
  heldForReview?: boolean;
  id: string;
  postId: string;
  author: PublicAuthor;
  body: string;
  createdAt: string;
};
export type Page<T> = { items: T[]; page: number; limit: number; total: number; hasMore: boolean };
export type ListPostsInput = {
  q?: string;
  category?: Category;
  status?: Status;
  sort?: Sort;
  page?: number;
  limit?: number;
};
export type RoadmapResult = Record<
  "planned" | "in_progress" | "done",
  { items: PostSummary[]; total: number }
>;
export type CreatePostResult = { postId: string; postUrl: string; heldForReview?: boolean };
export type VoteResult = { votes: number; viewerHasVoted: boolean };
export type FollowResult = { following: boolean };
export type ErrorCode =
  | "invalid_input"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "too_large"
  | "unsupported_image"
  | "rate_limited"
  | "unavailable";
export type ApiError = { code: ErrorCode; message: string; field?: string };
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };
