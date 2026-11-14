export type Category = "feature" | "bug" | "general";
export type Status = "open" | "planned" | "in_progress" | "done" | "closed";
export type Sort = "new" | "top" | "trending";
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
export type ViewerUser = { id: string; name: string; kind: "account" | "host" | "anonymous" };
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
};
export type PostDetail = PostSummary & {
  body: string;
  images: ImageView[];
  githubUrl: string | null;
};
export type CommentView = {
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
export type CreatePostResult = { postId: string; postUrl: string };
export type VoteResult = { votes: number; viewerHasVoted: boolean };
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
