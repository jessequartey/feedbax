import { IntegrationError } from "../contracts/integrations.ts";
import type {
  FailureClassification,
  FetchFn,
  IntegrationErrorKind,
} from "../contracts/integrations.ts";
import { GITHUB_API_VERSION, NOTION_VERSION } from "./notion-schema.ts";

// Recognize fixed runtime signatures; never retain exception text, URLs or supplied data.
function fetchFailure(error: unknown): FailureClassification {
  if (error instanceof Error) {
    if (error.message.startsWith("Invalid redirect value, must be one of"))
      return "runtime_redirect";
    if (
      error.message.includes("Cannot perform I/O on behalf of a different request") ||
      error.message.includes("Some functionality, such as asynchronous I/O, timeouts")
    )
      return "runtime_io_context";
    if (error.message === "Illegal invocation") return "illegal_invocation";
    if (error.name === "TimeoutError" || error.name === "AbortError") return "timeout";
  }
  return "network";
}

export type ProviderRequest = <T>(path: string, method?: string, body?: unknown) => Promise<T>;

function retryAfter(headers: Headers): number | null {
  const value = headers.get("Retry-After");
  const delay =
    value === null
      ? NaN
      : /^\d+(\.\d+)?$/.test(value)
        ? Number(value) * 1000
        : Date.parse(value) - Date.now();
  const reset = headers.get("X-RateLimit-Reset");
  const resetDelay = reset === null ? NaN : Number(reset) * 1000 - Date.now();
  const delays = [delay, resetDelay].filter(Number.isFinite);
  return delays.length ? Math.max(0, ...delays) : null;
}

/** No in-process retry: an ambiguous create must return to find-before-create in the queue. */
export function createProviderRequest(
  provider: "notion" | "github",
  token: string,
  request: FetchFn = fetch,
  onSuccess?: () => Promise<void>,
): ProviderRequest {
  return async <T>(path: string, method = "GET", body?: unknown): Promise<T> => {
    if (!token.trim()) {
      throw new IntegrationError(provider, "auth", 401, null, `${provider} token is missing.`);
    }
    let response: Response;
    try {
      response = await request(
        `${provider === "notion" ? "https://api.notion.com/v1" : "https://api.github.com"}${path}`,
        {
          method,
          // workerd supports follow/manual only. Reject non-ok redirects below without
          // following Location or forwarding the integration credential.
          redirect: "manual",
          signal: AbortSignal.timeout(10_000),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            ...(provider === "notion"
              ? { "Notion-Version": NOTION_VERSION }
              : {
                  Accept: "application/vnd.github+json",
                  "X-GitHub-Api-Version": GITHUB_API_VERSION,
                  "User-Agent": "feedbax/0.3.1",
                }),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
      );
    } catch (error) {
      // Never propagate a fetch error, which may contain a URL, body or token.
      throw new IntegrationError(
        provider,
        "transient",
        null,
        null,
        `${provider} request failed or timed out.`,
        fetchFailure(error),
      );
    }
    if (!response.ok) {
      const limited =
        response.status === 429 ||
        (response.status === 403 &&
          (response.headers.has("Retry-After") ||
            response.headers.get("X-RateLimit-Remaining") === "0"));
      const kind: IntegrationErrorKind = limited
        ? "rate_limit"
        : response.status >= 500
          ? "transient"
          : response.status === 401
            ? "auth"
            : response.status === 403
              ? "permission"
              : response.status === 404
                ? "not_found"
                : "schema";
      const hints: Record<IntegrationErrorKind, string> = {
        auth: "Check that the whole integration token was copied.",
        permission:
          "Check integration access and permissions (GitHub requires Issues: read and write).",
        not_found: "Check the configured target and share it with the integration.",
        schema: "Check the required property names, types and request configuration.",
        rate_limit: "Provider rate limit reached; retry later.",
        transient: "Provider is temporarily unavailable.",
      };
      await response.body?.cancel();
      throw new IntegrationError(
        provider,
        kind,
        response.status,
        limited || response.status >= 500 ? retryAfter(response.headers) : null,
        `${provider} returned ${response.status}. ${hints[kind]}`,
      );
    }
    let result: T;
    try {
      result = (await response.json()) as T;
    } catch {
      throw new IntegrationError(
        provider,
        "transient",
        response.status,
        null,
        `${provider} returned an invalid response.`,
        "invalid_response",
      );
    }
    await onSuccess?.();
    return result;
  };
}
