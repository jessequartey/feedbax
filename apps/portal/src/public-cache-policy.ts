import { feedbackStatuses, feedbackTypes } from "./public-feedback-page";

const BROWSER_CACHE_CONTROL = "public, max-age=30";
const EDGE_CACHE_CONTROL =
  "public, max-age=120, stale-while-revalidate=600, stale-if-error=86400";
const PUBLIC_PROJECTION_SCHEMA_VERSION = "1";
const PUBLIC_FEEDBACK_PAGE_SIZE = "25";
const PUBLIC_FEEDBACK_SORT = "created-at-desc";
const PUBLIC_ROADMAP_SORT = "updated-at-desc";

const feedbackTypeSet = new Set<string>(feedbackTypes);
const feedbackStatusSet = new Set<string>(feedbackStatuses);

export function canonicalPublicRequest(request: Request): Request | undefined {
  if (request.method !== "GET") return undefined;
  const source = new URL(request.url);
  if (!isPublicPath(source.pathname)) return undefined;

  const canonical = new URL(source.origin + source.pathname);
  if (source.pathname === "/") {
    appendAllowed(canonical, source, "cursor");
    appendAllowed(canonical, source, "status", feedbackStatusSet);
    appendAllowed(canonical, source, "type", feedbackTypeSet);
    canonical.searchParams.set("pageSize", PUBLIC_FEEDBACK_PAGE_SIZE);
    canonical.searchParams.set("sort", PUBLIC_FEEDBACK_SORT);
  } else if (source.pathname === "/roadmap") {
    canonical.searchParams.set("sort", PUBLIC_ROADMAP_SORT);
  }
  canonical.searchParams.set("schema", PUBLIC_PROJECTION_SCHEMA_VERSION);

  if (canonical.href === source.href) return undefined;
  return new Request(canonical, request);
}

export function applyPublicCachePolicy(
  request: Request,
  source: Response,
): Response {
  const response = new Response(source.body, source);
  if (!isSafePublicProjection(request, response)) {
    response.headers.set("Cache-Control", "no-store");
    response.headers.delete("Cloudflare-CDN-Cache-Control");
    response.headers.delete("Cache-Tag");
    return response;
  }

  response.headers.set("Cache-Control", BROWSER_CACHE_CONTROL);
  response.headers.set("Cloudflare-CDN-Cache-Control", EDGE_CACHE_CONTROL);
  response.headers.set("Cache-Tag", publicCacheTags(new URL(request.url)));
  return response;
}

function isSafePublicProjection(request: Request, response: Response): boolean {
  if (request.method !== "GET" || response.status !== 200) return false;
  if (response.headers.has("Set-Cookie")) return false;
  const { pathname } = new URL(request.url);
  return isPublicPath(pathname);
}

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/roadmap" ||
    /^\/feedback\/[^/]+\/[^/]+$/.test(pathname)
  );
}

function publicCacheTags(url: URL): string {
  if (url.pathname === "/roadmap") {
    return "feedbax-public,feedbax-roadmap";
  }
  const itemId = /^\/feedback\/([^/]+)\//.exec(url.pathname)?.[1];
  if (itemId) {
    return `feedbax-public,feedbax-feedback,feedbax-item-${safeTag(itemId)}`;
  }
  return "feedbax-public,feedbax-feedback";
}

function safeTag(value: string): string {
  return decodeURIComponent(value).replace(/[^A-Za-z0-9_.:-]/g, "-");
}

function appendAllowed(
  target: URL,
  source: URL,
  name: string,
  allowed?: ReadonlySet<string>,
): void {
  const value = source.searchParams.get(name);
  if (value && (!allowed || allowed.has(value))) {
    target.searchParams.set(name, value);
  }
}
