export interface ProductParticipant {
  id: string;
  name?: string;
  email?: string;
}
interface FeedbackClient {
  submitFeedback(
    values: {
      title: string;
      description: string;
      type: "Feature Request" | "Bug Report" | "General Feedback";
      submitter?: { name?: string; email?: string };
    },
    options: { idempotencyKey: string },
  ): Promise<{ slug: string; title: string }>;
}
export function createFeedbackSubmissionHandler(options: {
  applicationOrigin: string;
  client: FeedbackClient;
  authenticate(request: Request): Promise<ProductParticipant | null>;
  rateLimit(participantId: string): Promise<boolean>;
}) {
  const origin = new URL(options.applicationOrigin).origin;
  return async (request: Request): Promise<Response> => {
    const json = (body: unknown, status = 200) =>
      Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
    if (request.method !== "POST")
      return json({ error: "Method not allowed" }, 405);
    if (request.headers.get("origin") !== origin)
      return json({ error: "Invalid origin" }, 403);
    const user = await options.authenticate(request);
    if (!user) return json({ error: "Sign in to send feedback." }, 401);
    if (!(await options.rateLimit(user.id)))
      return json({ error: "Too many requests. Try again shortly." }, 429);
    const key = request.headers.get("idempotency-key");
    if (!key || !/^[A-Za-z0-9_-]{16,100}$/.test(key))
      return json({ error: "A valid Idempotency-Key is required." }, 400);
    let body: unknown;
    try {
      const text = await request.text();
      if (text.length > 24000)
        return json({ error: "Request is too large." }, 413);
      body = JSON.parse(text);
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    if (!body || typeof body !== "object")
      return json({ error: "Invalid feedback" }, 400);
    const title = Reflect.get(body, "title"),
      description = Reflect.get(body, "description"),
      type = Reflect.get(body, "type");
    if (
      typeof title !== "string" ||
      !title.trim() ||
      title.trim().length > 120 ||
      typeof description !== "string" ||
      !description.trim() ||
      description.trim().length > 5000 ||
      (type !== "Feature Request" &&
        type !== "Bug Report" &&
        type !== "General Feedback")
    )
      return json({ error: "Add a valid title, description, and type." }, 400);
    try {
      return json(
        await options.client.submitFeedback(
          {
            title: title.trim(),
            description: description.trim(),
            type,
            submitter: { name: user.name, email: user.email },
          },
          { idempotencyKey: `${user.id}:${key}` },
        ),
      );
    } catch {
      return json(
        {
          error:
            "Feedback is temporarily unavailable. Retry the same submission.",
        },
        502,
      );
    }
  };
}
