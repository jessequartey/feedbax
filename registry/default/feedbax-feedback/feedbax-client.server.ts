export type FeedbackFormValues = {
  title: string;
  description: string;
  type: "Feature Request" | "Bug Report" | "General Feedback";
  submitter?: { name?: string; email?: string };
};

export type SubmissionResult = { slug: string; title: string };

export function createFeedbaxClient({
  apiBaseUrl,
  apiSecret,
  request = fetch,
}: {
  apiBaseUrl: string;
  apiSecret: string;
  request?: typeof fetch;
}) {
  const endpoint = new URL("/api/v1/posts", withTrailingSlash(apiBaseUrl));
  return {
    async submitFeedback(
      values: FeedbackFormValues,
      options: { idempotencyKey?: string } = {},
    ): Promise<SubmissionResult> {
      const response = await request(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiSecret}`,
          "Content-Type": "application/json",
          "Idempotency-Key": options.idempotencyKey ?? crypto.randomUUID(),
        },
        body: JSON.stringify(values),
      });
      const body: unknown = await response.json().catch(() => undefined);
      if (!response.ok) {
        const detail =
          body &&
          typeof body === "object" &&
          typeof Reflect.get(body, "error") === "string"
            ? String(Reflect.get(body, "error"))
            : `Feedbax returned ${response.status}.`;
        throw new Error(detail);
      }
      if (
        !body ||
        typeof body !== "object" ||
        typeof Reflect.get(body, "slug") !== "string" ||
        typeof Reflect.get(body, "title") !== "string"
      ) {
        throw new Error("Feedbax returned an invalid submission response.");
      }
      return {
        slug: String(Reflect.get(body, "slug")),
        title: String(Reflect.get(body, "title")),
      };
    },
  };
}

function withTrailingSlash(value: string) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
    throw new Error("apiBaseUrl must use HTTPS outside local development.");
  }
  return parsed.toString().endsWith("/")
    ? parsed
    : new URL(`${parsed.toString()}/`);
}
