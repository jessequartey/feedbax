// Drafts survive the trip to /login. They live in sessionStorage and never hold images.
import type { Category } from "@/contracts/domain";
import { CATEGORY_VALUES } from "./portal-search";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const POST_DRAFT_KEY = "feedbax:draft:post";
export const commentDraftKey = (postId: string) => `feedbax:draft:comment:${postId}`;

export type PostDraft = { id: string; title: string; body: string; category: Category };
export type CommentDraft = { id: string; body: string };

function defaultStorage(): StorageLike | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function saveDraft(key: string, value: unknown, storage = defaultStorage()): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be full or blocked. A lost draft is not worth an error.
  }
}

export function loadDraft<T>(
  key: string,
  parse: (raw: unknown) => T | null,
  storage = defaultStorage(),
): T | null {
  try {
    const text = storage?.getItem(key);
    return text ? parse(JSON.parse(text)) : null;
  } catch {
    return null;
  }
}

export function clearDraft(key: string, storage = defaultStorage()): void {
  try {
    storage?.removeItem(key);
  } catch {
    // ignore
  }
}

const isRecord = (raw: unknown): raw is Record<string, unknown> =>
  typeof raw === "object" && raw !== null;

export function parsePostDraft(raw: unknown): PostDraft | null {
  if (!isRecord(raw)) return null;
  const { id, title, body, category } = raw;
  if (typeof id !== "string" || typeof title !== "string" || typeof body !== "string") return null;
  if (typeof category !== "string" || !(CATEGORY_VALUES as readonly string[]).includes(category))
    return null;
  return { id, title, body, category: category as Category };
}

export function parseCommentDraft(raw: unknown): CommentDraft | null {
  if (!isRecord(raw)) return null;
  return typeof raw.id === "string" && typeof raw.body === "string"
    ? { id: raw.id, body: raw.body }
    : null;
}
