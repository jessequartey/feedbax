import { AI_DEFAULT_MODELS } from "../contracts/ai.ts";
import { clustersFromPairs, findCandidatePairs } from "./local.ts";
import { allowedOrAll, plain, withTimeout } from "./shared.ts";
import type { AiProvider } from "./types.ts";

// Documented at https://docs.typesafe.ai/introduction/quickstart (POST /v1/systemone,
// questions as a map of typed questions, answers under `answers.<id>`).
export const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";

type JevAnswers = Record<string, { choice?: unknown; noul?: unknown; confidence?: unknown }>;

async function callJev(
  apiKey: string,
  model: string,
  state: string,
  questions: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<JevAnswers> {
  const response = await fetch(JEV_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, state, questions }),
    signal: withTimeout(signal),
  });
  if (!response.ok) throw new Error(`Jev API returned ${response.status}`);
  const data = (await response.json()) as { answers?: JevAnswers };
  if (!data.answers) throw new Error("Unexpected Jev response");
  return data.answers;
}

const noulScore = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

export function createJevProvider(apiKey: string, model?: string | null): AiProvider {
  const resolved = model?.trim() || AI_DEFAULT_MODELS.jev;
  return {
    name: "jev",
    async suggestCategory(input, allowedCategories, signal) {
      const categories = allowedOrAll(allowedCategories);
      const answers = await callJev(
        apiKey,
        resolved,
        JSON.stringify({ title: plain(input.title, 200), body: plain(input.body, 500) }),
        {
          category: {
            type: "choice",
            instructions: "Which feedback category best fits this post?",
            criteria: Object.fromEntries(categories.map((category) => [category, category])),
          },
        },
        signal,
      );
      const answer = answers.category;
      const choice = typeof answer?.choice === "string" ? answer.choice.trim().toLowerCase() : "";
      if (!categories.includes(choice as (typeof categories)[number])) return null;
      return {
        category: choice as (typeof categories)[number],
        confidence: noulScore(answer?.confidence) || 0.85,
        source: "jev",
      };
    },
    async clusterPosts(posts, signal) {
      const pairs = findCandidatePairs(posts, 0.3, 15);
      if (!pairs.length) return [];
      const answers = await callJev(
        apiKey,
        resolved,
        JSON.stringify({
          pairs: pairs.map((pair, index) => ({
            index,
            a: { title: plain(pair.a.title, 140), body: plain(pair.a.body, 160) },
            b: { title: plain(pair.b.title, 140), body: plain(pair.b.body, 160) },
          })),
        }),
        Object.fromEntries(
          pairs.map((_, index) => [
            `pair${index}`,
            { type: "noul", instructions: `Pair ${index} posts describe the same issue` },
          ]),
        ),
        signal,
      );
      const confirmed = pairs.filter((_, index) => noulScore(answers[`pair${index}`]?.noul) >= 0.5);
      return clustersFromPairs(posts, confirmed);
    },
  };
}
