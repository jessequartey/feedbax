// Browser-side API client for the Feedbax portal. No dependencies, no React.
import type { ApiError, Category, CreatePostResult, ErrorCode, TokenResult } from "./types";

export type GetToken = () => Promise<TokenResult>;

export type FeedbaxErrorKind =
  | "token" // your token endpoint failed: usually the user is signed out of your app
  | "network" // the portal could not be reached (offline, CORS, DNS)
  | "api"; // the portal answered with an error

/** Everything the dialog needs to explain a failure and decide whether a retry makes sense. */
export class FeedbaxError extends Error {
  readonly kind: FeedbaxErrorKind;
  readonly code: ErrorCode | null;
  readonly status: number | null;
  readonly field: string | null;
  readonly retryAfterSeconds: number | null;
  constructor(
    kind: FeedbaxErrorKind,
    message: string,
    extra: {
      code?: ErrorCode | null;
      status?: number | null;
      field?: string | null;
      retryAfterSeconds?: number | null;
    } = {},
  ) {
    super(message);
    this.name = "FeedbaxError";
    this.kind = kind;
    this.code = extra.code ?? null;
    this.status = extra.status ?? null;
    this.field = extra.field ?? null;
    this.retryAfterSeconds = extra.retryAfterSeconds ?? null;
  }
}

/** Removes a trailing slash and refuses anything that is not an http(s) URL. */
export function normalizePortalUrl(portalUrl: string): string {
  let url: URL;
  try {
    url = new URL(portalUrl);
  } catch {
    throw new Error(`Invalid portalUrl: ${portalUrl}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("portalUrl must be http(s)");
  return url.origin + url.pathname.replace(/\/+$/, "");
}

/** Fetches a fresh single-use token from the host's own endpoint (same-origin cookies). */
export function createTokenGetter(tokenUrl = "/api/feedbax-token"): GetToken {
  return async () => {
    let response: Response;
    try {
      response = await fetch(tokenUrl, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
    } catch {
      throw new FeedbaxError("token", "Could not reach this app's feedback endpoint.");
    }
    if (!response.ok) {
      throw new FeedbaxError(
        "token",
        response.status === 401 || response.status === 403
          ? "You need to be signed in to send feedback."
          : "Could not get permission to send feedback.",
        { status: response.status },
      );
    }
    const data = (await response.json().catch(() => null)) as Partial<TokenResult> | null;
    if (!data || typeof data.token !== "string" || data.token.length === 0)
      throw new FeedbaxError("token", "The feedback endpoint returned an unexpected response.", {
        status: response.status,
      });
    return { token: data.token };
  };
}

const SAFE_TO = /^(\/|\/posts\/[0-9a-fA-F-]{36})$/;

/** The SSO link that signs the user in to the portal and lands on `to` ("/" or "/posts/<id>"). */
export function signInUrl({
  portalUrl,
  token,
  to = "/",
}: {
  portalUrl: string;
  token: string;
  to?: string;
}): string {
  const target = SAFE_TO.test(to) ? to : "/";
  const query = new URLSearchParams({ token, to: target });
  return `${normalizePortalUrl(portalUrl)}/api/auth/feedbax/sign-in?${query.toString()}`;
}

async function readApiError(response: Response): Promise<FeedbaxError> {
  const body = (await response.json().catch(() => null)) as { error?: Partial<ApiError> } | null;
  const retryAfter = Number(response.headers.get("Retry-After"));
  return new FeedbaxError(
    "api",
    body?.error?.message ?? `The portal returned ${response.status}.`,
    {
      code: body?.error?.code ?? null,
      status: response.status,
      field: body?.error?.field ?? null,
      retryAfterSeconds: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
    },
  );
}

export type SubmitFeedbackOptions = {
  portalUrl: string;
  getToken: GetToken;
  id: string;
  title: string;
  body: string;
  category: Category;
  images: Blob[];
  signal?: AbortSignal;
};

/**
 * One multipart POST to `{portalUrl}/api/posts`. Cross-origin, `credentials: 'omit'`, bearer token.
 * A 401 means the single-use token was rejected, so we fetch one more token and retry once.
 * The post `id` never changes here, which makes the retry safe (the portal treats a replay as a no-op).
 */
export async function submitFeedback(o: SubmitFeedbackOptions): Promise<CreatePostResult> {
  o.signal?.throwIfAborted();
  const endpoint = `${normalizePortalUrl(o.portalUrl)}/api/posts`;
  const form = new FormData();
  form.set("id", o.id);
  form.set("title", o.title);
  form.set("body", o.body);
  form.set("category", o.category);
  o.images.forEach((image, index) => {
    const extension =
      image.type === "image/webp" ? "webp" : image.type === "image/jpeg" ? "jpg" : "png";
    form.append("image", image, `image-${index + 1}.${extension}`);
  });

  const attempt = async (): Promise<Response> => {
    o.signal?.throwIfAborted();
    const { token } = await o.getToken();
    o.signal?.throwIfAborted();
    try {
      return await fetch(endpoint, {
        method: "POST",
        body: form,
        headers: { Authorization: `Bearer ${token}` },
        credentials: "omit",
        mode: "cors",
        signal: o.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw new FeedbaxError("network", "Could not reach the feedback portal.");
    }
  };

  let response = await attempt();
  if (response.status === 401) response = await attempt();
  if (!response.ok) throw await readApiError(response);
  const data = (await response.json().catch(() => null)) as Partial<CreatePostResult> | null;
  if (!data || typeof data.postId !== "string")
    throw new FeedbaxError("api", "The portal returned an unexpected response.", {
      status: response.status,
    });
  return { postId: data.postId, postUrl: typeof data.postUrl === "string" ? data.postUrl : "" };
}

export type ErrorView = {
  message: string;
  /** The form field to point at, when the portal told us which one is wrong. */
  field: "title" | "body" | "category" | "image" | null;
  /** Retrying the same draft can succeed. When false, the user has to change something first. */
  retryable: boolean;
};

function waitText(seconds: number | null): string {
  if (!seconds) return "a little while";
  if (seconds < 90) return "a minute";
  return `${Math.ceil(seconds / 60)} minutes`;
}

/** Turns any failure from `submitFeedback` into copy a person can act on. */
export function describeSubmitError(error: unknown): ErrorView {
  if (!(error instanceof FeedbaxError))
    return {
      message: "Something went wrong. Your draft is safe, so you can try again.",
      field: null,
      retryable: true,
    };

  if (error.kind === "token") {
    return {
      message:
        error.status === 401 || error.status === 403
          ? "You need to be signed in to send feedback. Sign in to this app, then try again."
          : "We couldn't get permission to send feedback just now. Try again in a moment.",
      field: null,
      retryable: true,
    };
  }
  if (error.kind === "network") {
    return {
      message:
        "We couldn't reach the feedback portal. Check your connection and try again. If it keeps happening, the portal may not allow this site yet (see appUrl in its settings).",
      field: null,
      retryable: true,
    };
  }
  const field =
    (["title", "body", "category"] as const).find((name) => name === error.field) ??
    (error.field === "image" ? "image" : null);
  switch (error.code) {
    case "unauthenticated":
      return {
        message: "The portal didn't accept your sign-in. Reload this page and try again.",
        field: null,
        retryable: true,
      };
    case "rate_limited":
      return {
        message: `You've sent a lot of feedback recently. Please try again in ${waitText(error.retryAfterSeconds)}.`,
        field: null,
        retryable: true,
      };
    case "too_large":
    case "unsupported_image":
      return {
        message:
          "One of your images is too large or isn't a PNG, JPEG or WebP. Remove or replace it, then send again.",
        field: "image",
        retryable: false,
      };
    case "invalid_input":
      return { message: error.message, field, retryable: false };
    case "conflict":
      return {
        message: "We couldn't send this draft. Change something and send it again.",
        field: null,
        retryable: false,
      };
    case "forbidden":
      return {
        message: "This site isn't allowed to send feedback to the portal.",
        field: null,
        retryable: false,
      };
    default:
      return {
        message: "The feedback portal is having trouble right now. Try again in a minute.",
        field: null,
        retryable: true,
      };
  }
}
