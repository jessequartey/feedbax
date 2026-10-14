import type { ProductConfiguration } from "@feedbax/config";

export function createPortalHead(
  product: ProductConfiguration,
  stylesheetHref?: string,
) {
  return {
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: product.name },
      { name: "description", content: product.description },
      { property: "og:title", content: product.name },
      { property: "og:description", content: product.description },
      { property: "og:type", content: "website" },
      ...(product.siteUrl
        ? [{ property: "og:url", content: product.siteUrl }]
        : []),
    ],
    links: [
      { rel: "icon", href: product.logo },
      ...(product.siteUrl ? [{ rel: "canonical", href: product.siteUrl }] : []),
      ...(stylesheetHref ? [{ rel: "stylesheet", href: stylesheetHref }] : []),
    ],
  };
}

export function createRouteHead(
  product: ProductConfiguration,
  route: {
    title?: string;
    description?: string;
    path: string;
    noIndex?: boolean;
  },
) {
  const title = route.title ? `${route.title} · ${product.name}` : product.name;
  const description = route.description ?? product.description;
  const canonical = product.siteUrl
    ? new URL(route.path, ensureTrailingSlash(product.siteUrl)).toString()
    : undefined;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      ...(canonical ? [{ property: "og:url", content: canonical }] : []),
      ...(route.noIndex ? [{ name: "robots", content: "noindex" }] : []),
    ],
    links: canonical ? [{ rel: "canonical", href: canonical }] : [],
  };
}

function ensureTrailingSlash(value: string) {
  return value.endsWith("/") ? value : `${value}/`;
}
