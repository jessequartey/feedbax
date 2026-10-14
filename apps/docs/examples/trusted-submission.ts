const portalUrl = "https://feedback.example.com";

export async function submitFeedback(
  input: {
    title: string;
    description: string;
    type: "Feature Request" | "Bug Report" | "General Feedback";
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
