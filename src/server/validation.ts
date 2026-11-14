import { invalid } from "./errors.ts";
import type { Category, ListPostsInput, Status } from "../contracts/domain.ts";

// Dependency-free validators, like contracts/config.ts. Never coerce untrusted values.
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
export function text(value: unknown, max: number, field: string, min = 1): string {
  if (
    typeof value !== "string" ||
    Array.from(value).length < min ||
    Array.from(value).length > max ||
    (min > 0 && !value.trim())
  )
    invalid(field);
  return value;
}
export function uuid(value: unknown, field = "id"): string {
  if (
    typeof value !== "string" ||
    value.length !== 36 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  )
    invalid(field);
  return value;
}
export function choice<T extends string>(value: unknown, choices: readonly T[], field: string): T {
  if (typeof value !== "string" || !choices.includes(value as T)) invalid(field);
  return value as T;
}
export function category(value: unknown): Category {
  return choice(value, ["feature", "bug", "general"], "category");
}
export function pageNumber(
  value: unknown,
  fallback = 1,
  max = Math.floor(Number.MAX_SAFE_INTEGER / 50),
): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > max)
    invalid("page");
  return value;
}
export function listInput(
  value: unknown,
): Required<Pick<ListPostsInput, "sort" | "page" | "limit">> & ListPostsInput {
  const v = record(value);
  return {
    ...(v.q === undefined ? {} : { q: text(v.q, 100, "q", 0) }),
    ...(v.category === undefined ? {} : { category: category(v.category) }),
    ...(v.status === undefined
      ? {}
      : {
          status: choice<Status>(
            v.status,
            ["open", "planned", "in_progress", "done", "closed"],
            "status",
          ),
        }),
    sort: v.sort === undefined ? "trending" : choice(v.sort, ["new", "top", "trending"], "sort"),
    page: pageNumber(v.page),
    limit: pageNumber(v.limit, 20, 50),
  };
}
