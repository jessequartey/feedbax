// Open Graph / X card tags for the document head.
//
// Documents are a static prerendered shell and crawlers never run JS, so these tags must be
// right at BUILD time. vite.config.ts reads `vars.PORTAL_URL` from wrangler.jsonc (create-feedbax
// writes the real https URL there before it builds) and the portal name from feedbax.config.ts,
// and inlines both as `__FEEDBAX_SOCIAL__`.

export type SocialBuild = {
  /** `name` from feedbax.config.ts. */
  name: string;
  /** `vars.PORTAL_URL` from wrangler.jsonc, as written. */
  portalUrl: string;
};

/** The card image: public/og.png, 1200×600. Replace the file to change it. */
export const OG_IMAGE_PATH = "/og.png";
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 600;

/**
 * The origin of a deployed portal, or null when the URL is missing, unparseable, not https,
 * or local. X and Facebook only accept absolute image URLs on a public https host, so anything
 * else falls back to relative paths (which still work for the page itself).
 */
export function publicOrigin(portalUrl: string | undefined): string | null {
  if (!portalUrl) return null;
  let url: URL;
  try {
    url = new URL(portalUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host === "[::1]") return null;
  if (/^(?:127\.|0\.0\.0\.0$)/.test(host)) return null;
  return url.origin;
}

/** `vars.PORTAL_URL` from wrangler.jsonc text; null if absent. */
export function portalUrlFromWrangler(source: string): string | null {
  return /"PORTAL_URL"\s*:\s*"([^"\\]*)"/.exec(source)?.[1] ?? null;
}

type Meta = Record<string, string>;

/** The social tags. Empty `build` (tests, unknown config) gives the relative fallback. */
export function socialMeta(description: string, build?: Partial<SocialBuild>): Meta[] {
  const title = build?.name || "Feedbax";
  const origin = publicOrigin(build?.portalUrl);
  const image = origin ? `${origin}${OG_IMAGE_PATH}` : OG_IMAGE_PATH;
  const alt = `${title}: a feedback portal for ideas, votes and comments`;
  return [
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: title },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    // og:url must be absolute, so it is only emitted when the portal origin is public.
    ...(origin ? [{ property: "og:url", content: `${origin}/` }] : []),
    { property: "og:image", content: image },
    { property: "og:image:type", content: "image/png" },
    { property: "og:image:width", content: String(OG_IMAGE_WIDTH) },
    { property: "og:image:height", content: String(OG_IMAGE_HEIGHT) },
    { property: "og:image:alt", content: alt },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
    { name: "twitter:image:alt", content: alt },
  ];
}

declare const __FEEDBAX_SOCIAL__: SocialBuild | undefined;

/** The build-time values inlined by vite.config.ts; undefined under Vitest. */
export function socialBuild(): SocialBuild | undefined {
  return typeof __FEEDBAX_SOCIAL__ === "undefined" ? undefined : __FEEDBAX_SOCIAL__;
}
