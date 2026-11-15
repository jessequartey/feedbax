// URL search params for the board, My feedback and roadmap. Pure functions, so the
// round trip (URL -> filters -> URL) is unit tested without a router.
import type { Category, ListPostsInput, Sort, Status } from "@/contracts/domain";

export const CATEGORY_VALUES: readonly Category[] = ["feature", "bug", "general"];
export const STATUS_VALUES: readonly Status[] = [
  "open",
  "planned",
  "in_progress",
  "done",
  "closed",
];
export const SORT_VALUES: readonly Sort[] = ["trending", "top", "new", "priority"];
export const DEFAULT_SORT: Sort = "trending";
export const PAGE_SIZE = 20;
export const MAX_QUERY_LENGTH = 100;

export type BoardSearch = {
  q?: string;
  category?: Category;
  status?: Status;
  sort?: Sort;
  page?: number;
};
export type RoadmapSearch = { q?: string; category?: Category };

function pick<T extends string>(values: readonly T[], raw: unknown): T | undefined {
  return typeof raw === "string" && (values as readonly string[]).includes(raw)
    ? (raw as T)
    : undefined;
}

function parseQuery(raw: unknown): string | undefined {
  // TanStack JSON-parses search values, so "123" can arrive as the number 123.
  const text = typeof raw === "string" ? raw : typeof raw === "number" ? String(raw) : "";
  const trimmed = text.trim().slice(0, MAX_QUERY_LENGTH);
  return trimmed ? trimmed : undefined;
}

function parsePage(raw: unknown): number | undefined {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 1 && n <= 10_000 ? n : undefined;
}

function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

/** Normalises anything in the URL: unknown values are dropped and defaults are omitted. */
export function parseBoardSearch(raw: Record<string, unknown>): BoardSearch {
  const sort = pick(SORT_VALUES, raw.sort);
  return compact({
    q: parseQuery(raw.q),
    category: pick(CATEGORY_VALUES, raw.category),
    status: pick(STATUS_VALUES, raw.status),
    sort: sort && sort !== DEFAULT_SORT ? sort : undefined,
    page: parsePage(raw.page),
  });
}

export function parseRoadmapSearch(raw: Record<string, unknown>): RoadmapSearch {
  return compact({ q: parseQuery(raw.q), category: pick(CATEGORY_VALUES, raw.category) });
}

/** Applies a change from the UI. Any filter, search or sort change goes back to page 1. */
export function patchSearch(prev: BoardSearch, patch: Partial<BoardSearch>): BoardSearch {
  const merged: Record<string, unknown> = { ...prev, page: undefined, ...patch };
  return parseBoardSearch(merged);
}

export function toListInput(search: BoardSearch): ListPostsInput {
  return compact({
    q: search.q,
    category: search.category,
    status: search.status,
    sort: search.sort ?? DEFAULT_SORT,
    page: search.page ?? 1,
    limit: PAGE_SIZE,
  });
}

export function hasActiveFilters(search: { q?: string; category?: Category; status?: Status }) {
  return Boolean(search.q || search.category || search.status);
}

export function clearFilters(prev: BoardSearch): BoardSearch {
  return parseBoardSearch({ sort: prev.sort });
}
