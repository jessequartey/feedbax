import type { createObservedHistoryModule } from "@feedbax/feedback";

export function createPublicHistoryRequestHandler(options: {
  enabled: boolean;
  history?: ReturnType<typeof createObservedHistoryModule>;
  rateLimit: (request: Request) => Promise<boolean>;
}) {
  return async (request: Request): Promise<Response | undefined> => {
    const url = new URL(request.url);
    if (url.pathname !== "/internal/post-history") return;
    const json = (body: unknown, status = 200) =>
      Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
    if (!options.enabled || !options.history)
      return json({ error: "Not found." }, 404);
    if (request.method !== "GET")
      return json({ error: "Method not allowed." }, 405);
    const slug = url.searchParams.get("slug");
    const cursor = url.searchParams.get("cursor") ?? undefined;
    if (
      !slug ||
      slug.length > 200 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
      (cursor && (cursor.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(cursor)))
    )
      return json({ error: "Invalid history request." }, 400);
    if (!(await options.rateLimit(request)))
      return json({ error: "Too many requests. Try again shortly." }, 429);
    try {
      return json(await options.history.list({ slug, cursor }));
    } catch {
      return json(
        { error: "Progress history is temporarily unavailable." },
        503,
      );
    }
  };
}
