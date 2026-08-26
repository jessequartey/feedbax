const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MILLISECONDS = 250;
const MAX_BACKOFF_MILLISECONDS = 2_000;

export interface NotionRetryOptions {
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
}

export async function requestNotion(
  input: Parameters<typeof fetch>[0],
  init: RequestInit = {},
  {
    request,
    retry = {},
    operation,
  }: {
    request: typeof fetch;
    retry?: NotionRetryOptions;
    operation: "create" | "idempotent";
  },
): Promise<Response> {
  const sleep = retry.sleep ?? defaultSleep;
  const random = retry.random ?? Math.random;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const response = await request(input, init);
    if (!isRetryableNotionFailure(response.status, operation)) return response;
    if (attempt === MAX_ATTEMPTS) {
      throw new Error(
        `Notion request failed after ${MAX_ATTEMPTS} attempts (${response.status}).`,
      );
    }
    await sleep(retryDelayMilliseconds(response, attempt, random));
  }

  throw new Error("Notion request retry loop ended unexpectedly.");
}

function isRetryableNotionFailure(
  status: number,
  operation: "create" | "idempotent",
): boolean {
  return status === 429 || (status === 529 && operation === "idempotent");
}

function retryDelayMilliseconds(
  response: Response,
  attempt: number,
  random: () => number,
): number {
  const retryAfter = response.headers.get("Retry-After");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  }

  return exponentialDelayMilliseconds(attempt, random);
}

function exponentialDelayMilliseconds(
  attempt: number,
  random: () => number,
): number {
  const ceiling = Math.min(
    BASE_BACKOFF_MILLISECONDS * 2 ** (attempt - 1),
    MAX_BACKOFF_MILLISECONDS,
  );
  return Math.round(ceiling / 2 + random() * (ceiling / 2));
}

async function defaultSleep(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}
