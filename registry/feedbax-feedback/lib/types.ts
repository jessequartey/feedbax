// Copied from the Feedbax portal's `src/contracts/{domain,host-token}.ts`.
// Do not edit by hand: `tests/block/types-sync.test.ts` fails when this file drifts from the source.
export type Category = "feature" | "bug" | "general";
export const CATEGORY_LABELS: Record<Category, string> = {
  feature: "Feature request",
  bug: "Bug report",
  general: "General feedback",
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
export type CreatePostResult = { postId: string; postUrl: string; heldForReview?: boolean };
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
export type HostUser = { id: string; name: string }; // id → sub, 1–200 chars, no newline; name 1–80
export type MintOptions = { secret: string; user: HostUser; now?: number; jti?: string }; // now: epoch s; tests only
export type TokenResult = { token: string };
export const HOST_TOKEN_TTL_SECONDS = 300;
export const HOST_TOKEN_HEADER = '{"alg":"HS256","typ":"JWT"}';
