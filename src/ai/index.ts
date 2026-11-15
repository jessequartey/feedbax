import { createGeminiProvider } from "./gemini.ts";
import { createJevProvider } from "./jev.ts";
import { localProvider } from "./local.ts";
import { createOpenAiProvider } from "./openai.ts";
import type { AiConfig, AiProvider } from "./types.ts";

export type {
  AiConfig,
  AiPostCluster,
  AiPostInput,
  AiProvider,
  CategorySuggestion,
} from "./types.ts";
export {
  clusterLocal,
  clustersFromPairs,
  findCandidatePairs,
  jaccard,
  localProvider,
  suggestCategoryLocal,
  titleTokens,
} from "./local.ts";

/**
 * The configured provider, or local when it is off, has no key, or fails.
 * Never logs or returns the key; a provider error never reaches the caller.
 */
export function resolveAiProvider(config: AiConfig, apiKey?: string | null): AiProvider {
  if (config.provider === "off" || config.provider === "local") return localProvider;
  const key = apiKey?.trim();
  if (!key) return localProvider;
  const inner =
    config.provider === "jev"
      ? createJevProvider(key, config.model)
      : config.provider === "gemini"
        ? createGeminiProvider(key, config.model)
        : createOpenAiProvider(key, config.model);
  return {
    name: inner.name,
    async suggestCategory(input, allowedCategories, signal) {
      try {
        return (
          (await inner.suggestCategory(input, allowedCategories, signal)) ??
          localProvider.suggestCategory(input, allowedCategories, signal)
        );
      } catch {
        return localProvider.suggestCategory(input, allowedCategories, signal);
      }
    },
    async clusterPosts(posts, signal) {
      try {
        return await inner.clusterPosts(posts, signal);
      } catch {
        return localProvider.clusterPosts(posts, signal);
      }
    },
  };
}
