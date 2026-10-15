export interface GitHubAccessOptions {
  installationId: string;
  repository: { id: number; owner: string; name: string };
  botUserId: number;
  getToken(): Promise<string>;
  request?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
}

export class GitHubRateLimitError extends Error {
  readonly status = 429;
  constructor(readonly retryAfterMs: number) {
    super("GitHub is rate limited; durable retry is required.");
    this.name = "GitHubRateLimitError";
  }
}

export function createGitHubClient(options: GitHubAccessOptions) {
  if (
    !options.installationId.trim() ||
    options.installationId.length > 128 ||
    !Number.isSafeInteger(options.repository.id) ||
    options.repository.id <= 0 ||
    !Number.isSafeInteger(options.botUserId) ||
    options.botUserId <= 0 ||
    !/^[A-Za-z0-9-]+$/.test(options.repository.owner) ||
    !/^[A-Za-z0-9_.-]+$/.test(options.repository.name)
  )
    throw new Error(
      "GitHub requires a verified Installation, repository and App bot identity.",
    );
  const path = `/repos/${options.repository.owner}/${options.repository.name}`;
  const request = async (
    suffix: string,
    method = "GET",
    body?: unknown,
  ): Promise<Response> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const token = await options.getToken();
      if (!token) throw new Error("GitHub installation access is unavailable.");
      const response = await (options.request ?? fetch)(
        `https://api.github.com${path}${suffix}`,
        {
          method,
          redirect: "manual",
          headers: {
            Authorization: `Bearer ${token}`,
            "User-Agent": "Feedbax",
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2026-03-10",
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
      );
      const limited =
        response.status === 429 ||
        (response.status === 403 &&
          (response.headers.has("Retry-After") ||
            response.headers.get("X-RateLimit-Remaining") === "0"));
      const retryable = limited || (method === "GET" && response.status >= 500);
      if (!retryable || attempt === 2) return response;
      const retryAfter = response.headers.get("Retry-After");
      const reset = response.headers.get("X-RateLimit-Reset");
      const delay =
        retryAfter !== null
          ? Number.isFinite(Number(retryAfter))
            ? Number(retryAfter) * 1000
            : Date.parse(retryAfter) - Date.now()
          : limited && reset
            ? Number(reset) * 1000 - Date.now()
            : 250 * 2 ** attempt;
      const wait = Number.isFinite(delay) ? Math.max(0, delay) : 1000;
      if (wait > 2000) throw new GitHubRateLimitError(wait);
      await response.body?.cancel();
      await (
        options.sleep ??
        ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
      )(wait);
    }
    throw new Error("GitHub retry budget exhausted.");
  };
  return {
    request,
    async authorize() {
      const response = await request("");
      if (
        !response.ok ||
        ((await response.json()) as { id?: number }).id !==
          options.repository.id
      )
        throw new Error(
          "GitHub repository access is unavailable or no longer matches the Portal Binding.",
        );
    },
    async scan(suffix = "/issues?state=all") {
      const values: Record<string, unknown>[] = [];
      for (let page = 1; page <= 10; page++) {
        const response = await request(
          `${suffix}${suffix.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
        );
        if (!response.ok)
          throw new Error(`GitHub scan failed (${response.status}).`);
        const body: unknown = await response.json();
        if (!Array.isArray(body) || body.some((value) => !isRecord(value)))
          throw new Error("GitHub returned an invalid list.");
        values.push(...body);
        if (!response.headers.get("Link")?.includes('rel="next"'))
          return values;
      }
      throw new Error(
        "GitHub scan exceeded its bounded window; reconciliation is required.",
      );
    },
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
