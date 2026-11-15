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

export const OPENAI_CHAT_ENDPOINT = "https://api.openai.com/v1/chat/completions";

async function callOpenAi(
  apiKey: string,
  model: string,
  prompt: string,
  signal?: AbortSignal,
): Promise<string> {
  const response = await fetch(OPENAI_CHAT_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are a feedback triage assistant. Respond only with valid JSON.",
        },
        { role: "user", content: prompt },
      ],
    }),
    signal: withTimeout(signal),
  });
  if (!response.ok) throw new Error(`OpenAI API returned ${response.status}`);
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("Empty OpenAI response");
  return text;
}

export function createOpenAiProvider(apiKey: string, model?: string | null): AiProvider {
  const resolved = model?.trim() || AI_DEFAULT_MODELS.openai;
  return {
    name: "openai",
    async suggestCategory(input, allowedCategories, signal) {
      const categories = allowedOrAll(allowedCategories);
      return parseCategory(
        await callOpenAi(apiKey, resolved, categoryPrompt(input, categories), signal),
        categories,
        "openai",
      );
    },
    async clusterPosts(posts, signal) {
      const pairs = findCandidatePairs(posts, 0.3, 15);
      if (!pairs.length) return [];
      const confirmed = parsePairs(
        await callOpenAi(apiKey, resolved, pairPrompt(pairs), signal),
        pairs,
      );
      if (!confirmed) throw new Error("Unparseable OpenAI cluster response");
      return clustersFromPairs(posts, confirmed);
    },
  };
}
