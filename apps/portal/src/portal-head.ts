import type { ProductConfiguration } from "@feedbax/config";

export function createPortalHead(
  product: ProductConfiguration,
  stylesheetHref?: string,
) {
  return {
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Feedbax" },
    ],
    links: [
      { rel: "icon", href: product.logo },
      ...(stylesheetHref ? [{ rel: "stylesheet", href: stylesheetHref }] : []),
    ],
  };
}
