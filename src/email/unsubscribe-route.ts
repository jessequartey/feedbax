import { DomainError } from "../server/errors.ts";
import { errorResponse } from "../server/http.ts";
import { unsubscribeWithLink } from "./prefs.ts";
import { UNSUBSCRIBE_PAGE } from "./unsubscribe.ts";

/**
 * `POST` is the mail client's one-click unsubscribe: it acts at once and needs no session
 * or same-origin check, because the signed query is the authorization. `GET` never changes
 * anything (link scanners prefetch URLs); it sends a person to the confirmation page.
 */
export async function handleUnsubscribe(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "POST")
    return new Response(null, {
      status: 303,
      headers: {
        location: `${UNSUBSCRIBE_PAGE}${url.search}`,
        "cache-control": "no-store",
        "referrer-policy": "no-referrer",
      },
    });
  try {
    await unsubscribeWithLink(Object.fromEntries(url.searchParams));
    return new Response("Unsubscribed.\n", {
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(
      error instanceof DomainError ? error : error,
      "email.prefs",
    );
  }
}
