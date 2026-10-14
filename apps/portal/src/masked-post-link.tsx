import { Link } from "@tanstack/react-router";
import type { AnchorHTMLAttributes } from "react";

export function PostLink({
  slug,
  contextual = false,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  slug: string;
  contextual?: boolean;
}) {
  if (!contextual) {
    return <a {...props} href={`/p/${encodeURIComponent(slug)}`} />;
  }
  return (
    <Link
      {...props}
      to="."
      state={{ postDetailOverlay: { slug } }}
      mask={{
        to: "/p/$slug",
        params: { slug },
        unmaskOnReload: true,
      }}
    />
  );
}
