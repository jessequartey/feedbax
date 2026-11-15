import type { AiProviderName, CategorySuggestion } from "../contracts/ai.ts";
import type { Category } from "../contracts/domain.ts";
import { markdownToText } from "../lib/markdown.ts";
import { ALL_CATEGORIES, type CandidatePair } from "./local.ts";

export const AI_TIMEOUT_MS = 4000;

export function withTimeout(signal?: AbortSignal): AbortSignal {
  const timer = AbortSignal.timeout(AI_TIMEOUT_MS);
  return signal && typeof AbortSignal.any === "function" ? AbortSignal.any([signal, timer]) : timer;
}

export function allowedOrAll(categories?: readonly Category[]): readonly Category[] {
  const filtered = categories?.filter((category) => ALL_CATEGORIES.includes(category));
  return filtered?.length ? filtered : ALL_CATEGORIES;
}

export function plain(value: string | undefined, max = 400): string {
  if (!value) return "";
  const text = markdownToText(value).replace(/\s+/g, " ").trim();
  return text.length > max ? text.slice(0, max) : text;
}

export function jsonObject(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function parseCategory(
  raw: string,
  categories: readonly Category[],
  source: AiProviderName,
): CategorySuggestion | null {
  const obj = jsonObject(raw);
  const category = typeof obj?.category === "string" ? obj.category.trim().toLowerCase() : "";
  if (!categories.includes(category as Category)) return null;
  const confidence = typeof obj?.confidence === "number" ? obj.confidence : 0.75;
  return {
    category: category as Category,
    confidence: Math.max(0, Math.min(1, confidence)),
    source,
  };
}

export function categoryPrompt(
  input: { title: string; body?: string },
  categories: readonly Category[],
): string {
  return [
    `Classify this feedback post into exactly one category from: ${categories.join(", ")}.`,
    `Title: ${plain(input.title, 200)}`,
    input.body ? `Body: ${plain(input.body, 500)}` : "",
    `Respond only with JSON: {"category":"${categories[0]}","confidence":0.8}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function pairPrompt(pairs: readonly CandidatePair[]): string {
  return [
    "Which of these pairs of feedback posts describe the same bug or feature request?",
    `Pairs: ${JSON.stringify(
      pairs.map((pair, index) => ({
        index,
        a: { title: plain(pair.a.title, 140), body: plain(pair.a.body, 160) },
        b: { title: plain(pair.b.title, 140), body: plain(pair.b.body, 160) },
      })),
    )}`,
    `Respond only with JSON: {"duplicates":[0,2]}`,
  ].join("\n");
}

export function parsePairs(raw: string, pairs: readonly CandidatePair[]): CandidatePair[] | null {
  const obj = jsonObject(raw);
  if (!obj || !Array.isArray(obj.duplicates)) return null;
  const seen = new Set<number>();
  const confirmed: CandidatePair[] = [];
  for (const rawIndex of obj.duplicates) {
    const index = typeof rawIndex === "number" ? rawIndex : Number(rawIndex);
    if (!Number.isInteger(index) || index < 0 || index >= pairs.length || seen.has(index)) continue;
    seen.add(index);
    confirmed.push(pairs[index]!);
  }
  return confirmed;
}
