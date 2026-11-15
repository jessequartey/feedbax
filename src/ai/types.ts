import type { AiProviderName, CategorySuggestion } from "../contracts/ai.ts";
import type { Category } from "../contracts/domain.ts";

export type { AiProviderName, CategorySuggestion };

export type AiConfig = {
  provider: AiProviderName;
  model?: string | null;
};

export type AiPostInput = {
  id: string;
  title: string;
  body: string;
  votes?: number;
  createdAt?: number;
};

export type AiPostCluster = {
  targetId: string;
  memberIds: string[];
  score: number;
};

export interface AiProvider {
  readonly name: Exclude<AiProviderName, "off">;
  suggestCategory(
    input: { title: string; body?: string },
    allowedCategories?: readonly Category[],
    signal?: AbortSignal,
  ): Promise<CategorySuggestion | null>;
  clusterPosts(posts: readonly AiPostInput[], signal?: AbortSignal): Promise<AiPostCluster[]>;
}
