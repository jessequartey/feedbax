import { CliError } from "../../create-feedbax/src/flags.ts";

export const AI_CLI_PROVIDERS = ["jev", "gemini", "openai"] as const;
export type AiCliProvider = (typeof AI_CLI_PROVIDERS)[number];

/** Validate an AI key with a read-only request where the provider offers one. Never logs the key. */
export async function validateAiKey(
  provider: AiCliProvider,
  key: string,
  fetcher: typeof fetch,
): Promise<void> {
  if (!key.trim() || /\s/.test(key))
    throw new CliError("AI_API_KEY must be one non-empty key without spaces.", 2);
  let response: Response;
  try {
    if (provider === "openai") {
      response = await fetcher("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
      });
    } else if (provider === "gemini") {
      response = await fetcher("https://generativelanguage.googleapis.com/v1beta/models", {
        headers: { "x-goog-api-key": key },
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
      });
    } else {
      // One tiny System One question (https://docs.typesafe.ai/introduction/quickstart) checks the key.
      response = await fetcher("https://api.typesafe.ai/v1/systemone", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "jev-latest",
          state: "Feedbax connection check",
          questions: {
            check: { type: "noul", instructions: "This text is a connection check" },
          },
        }),
        signal: AbortSignal.timeout(10_000),
        redirect: "error",
      });
    }
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    throw new CliError(
      "Could not reach the AI provider to validate AI_API_KEY. Check your connection and retry.",
    );
  }
  if (!response.ok)
    throw new CliError(
      "The AI provider could not validate AI_API_KEY. Check the key and retry.",
      2,
    );
}
