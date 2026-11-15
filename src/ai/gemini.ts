import { AI_DEFAULT_MODELS } from "../contracts/ai.ts";
import { clustersFromPairs, findCandidatePairs } from "./local.ts";
import {
  allowedOrAll,
  categoryPrompt,
  pairPrompt,
  parseCategory,
  parsePairs,
  withTimeout,
} from "./shared.ts";
import type { AiProvider } from "./types.ts";

export function geminiEndpoint(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
}

async function callGemini(
  apiKey: string,
  model: string,
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(geminiEndpoint(model), {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
    }),
    signal: withTimeout(signal),
  });
  if (!response.ok) throw new Error(`Gemini API returned ${response.status}`);
  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) throw new Error("Empty Gemini response");
  return text;
}

export function createGeminiProvider(apiKey: string, model?: string | null): AiProvider {
  const resolved = model?.trim() || AI_DEFAULT_MODELS.gemini;
  return {
    name: "gemini",
    async suggestCategory(input, allowedCategories, signal) {
      const categories = allowedOrAll(allowedCategories);
      return parseCategory(
        await callGemini(apiKey, resolved, categoryPrompt(input, categories), signal),
        categories,
        "gemini",
      );
    },
    async clusterPosts(posts, signal) {
      const pairs = findCandidatePairs(posts, 0.3, 15);
      if (!pairs.length) return [];
      const confirmed = parsePairs(
        await callGemini(apiKey, resolved, pairPrompt(pairs), signal),
        pairs,
      );
      if (!confirmed) throw new Error("Unparseable Gemini cluster response");
      return clustersFromPairs(posts, confirmed);
    },
  };
}
