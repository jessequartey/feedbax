const portalUrl = "https://feedback.feedbax.dev";

export async function submitFeedback(
  input: {
    title: string;
    description: string;
    category: "Feature Request" | "Bug Report";
  },
  eventId: string,
) {
  return fetch(`${portalUrl}/api/v1/posts`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.FEEDBAX_API_SECRET}`,
      "content-type": "application/json",
      "idempotency-key": eventId,
    },
    body: JSON.stringify(input),
  });
}
