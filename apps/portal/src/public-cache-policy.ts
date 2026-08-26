import { postStatuses, postTypes } from "./public-feedback-page";
import {
  publicChangelogCacheTag,
  publicFeedbackCacheTag,
  publicPostCacheTag,
  publicRoadmapCacheTag,
} from "./public-cache-tags";

const BROWSER_CACHE_CONTROL = "public, max-age=30";
const EDGE_CACHE_CONTROL =
  "public, max-age=120, stale-while-revalidate=600, stale-if-error=86400";
const CHANGELOG_EDGE_CACHE_CONTROL = "public, max-age=30";
const PUBLIC_PROJECTION_SCHEMA_VERSION = "1";
const PUBLIC_FEEDBACK_PAGE_SIZE = "25";
const PUBLIC_FEEDBACK_SORT = "trending";
const PUBLIC_ROADMAP_SORT = "updated-at-desc";

const postTypeSet = new Set<string>(postTypes);
const postStatusSet = new Set<string>(postStatuses);

export function canonicalPublicRequest(request: Request): Request | undefined {
  if (request.method !== "GET") return undefined;
  const source = new URL(request.url);
  if (!isPublicPath(source.pathname)) return undefined;

  const canonical = new URL(source.origin + source.pathname);
  if (source.pathname === "/") {
    appendAllowed(canonical, source, "cursor");
    appendAllowed(canonical, source, "status", postStatusSet);
    appendAllowed(canonical, source, "type", postTypeSet);
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
  response.headers.set(
    "Cloudflare-CDN-Cache-Control",
    new URL(request.url).pathname === "/changelog"
      ? CHANGELOG_EDGE_CACHE_CONTROL
      : EDGE_CACHE_CONTROL,
  );
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
    pathname === "/changelog" ||
    /^\/p\/[^/]+$/.test(pathname)
  );
}

function publicCacheTags(url: URL): string {
  if (url.pathname === "/changelog") {
    return `feedbax-public,${publicChangelogCacheTag}`;
  }
  if (url.pathname === "/roadmap") {
    return `feedbax-public,${publicRoadmapCacheTag}`;
  }
  const slug = /^\/p\/([^/]+)$/.exec(url.pathname)?.[1];
  if (slug) {
    return `feedbax-public,${publicFeedbackCacheTag},${publicPostCacheTag(decodePathSegment(slug))}`;
  }
  return `feedbax-public,${publicFeedbackCacheTag}`;
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
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
