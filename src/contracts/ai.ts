import type { Category, Status } from "./domain.ts";

export type AiProviderName = "off" | "local" | "jev" | "gemini" | "openai";

export const AI_PROVIDERS: readonly AiProviderName[] = [
  "off",
  "local",
  "jev",
  "gemini",
  "openai",
] as const;

export const AI_PROVIDER_LABELS: Record<AiProviderName, string> = {
  off: "Off",
  local: "Local (no external calls)",
  jev: "Jev (TypeSafe AI)",
  gemini: "Google Gemini",
  openai: "OpenAI",
};

export const AI_DEFAULT_MODELS: Record<Exclude<AiProviderName, "off" | "local">, string> = {
  jev: "jev-latest",
  gemini: "gemini-2.5-flash",
  openai: "gpt-4o-mini",
};

export type AiSettings = {
  provider: AiProviderName;
  model: string | null;
};

export type SimilarPostHit = {
  id: string;
  title: string;
  status: Status;
  votes: number;
};

export type SuggestSimilarResult = {
  items: SimilarPostHit[];
  /** Local heuristic only; null when no category fits or it is not offered on this portal. */
  suggestedCategory: Category | null;
};

export type CategorySuggestion = {
  category: Category;
  confidence: number;
  source: AiProviderName;
};

export type SimilarGroupPost = {
  id: string;
  title: string;
  votes: number;
  createdAt: string;
};

export type SimilarPostGroup = {
  /** The post to keep: highest votes, then earliest. */
  target: SimilarGroupPost;
  duplicates: SimilarGroupPost[];
  score: number;
};

export type SimilarGroupsResult = {
  provider: AiProviderName;
  scanned: number;
  groups: SimilarPostGroup[];
};
