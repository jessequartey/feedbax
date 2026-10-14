import type { ComponentProps } from "react";

export function ProductScreenshot({
  caption,
  ...props
}: ComponentProps<"img"> & { caption: string }) {
  return (
    <figure className="product-shot">
      <img loading="lazy" decoding="async" {...props} />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
