"use client";

// <FeedbaxLink />: a link to your portal that signs the visitor in first ("Go to feedbax").
import * as React from "react";

import { cn } from "@/lib/utils";
import {
  createTokenGetter,
  normalizePortalUrl,
  signInUrl,
  type GetToken,
} from "@/lib/feedbax/client";

export type FeedbaxLinkProps = Omit<React.ComponentProps<"a">, "href" | "target" | "onClick"> & {
  portalUrl: string;
  tokenUrl?: string;
  /** Overrides `tokenUrl`. */
  getToken?: () => Promise<{ token: string }>;
  /** Where to land: the board, or one post. Default "/". */
  to?: "/" | `/posts/${string}`;
  target?: "_self" | "_blank";
  children: React.ReactNode;
};

export function FeedbaxLink({
  portalUrl,
  tokenUrl,
  getToken,
  to = "/",
  target = "_self",
  className,
  children,
  ...anchorProps
}: FeedbaxLinkProps) {
  const fetchToken: GetToken = React.useMemo(
    () => getToken ?? createTokenGetter(tokenUrl),
    [getToken, tokenUrl],
  );
  const [pending, setPending] = React.useState(false);
  const fallback = normalizePortalUrl(portalUrl);

  const onClick = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    // Let the browser handle modified clicks (open in new tab, etc.) with the plain portal link.
    if (
      event.defaultPrevented ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    )
      return;
    event.preventDefault();
    if (pending) return;
    setPending(true);
    // Open the window synchronously, inside the click, or popup blockers will stop it.
    const popup = target === "_blank" ? window.open("about:blank", "_blank") : null;
    if (popup) popup.opener = null;
    const go = (url: string) => (popup ? (popup.location.href = url) : window.location.assign(url));
    try {
      const { token } = await fetchToken();
      go(signInUrl({ portalUrl, token, to }));
    } catch {
      // The portal is public to read, so fall back to a plain visit instead of a dead end.
      go(fallback + (to === "/" ? "" : to));
    } finally {
      setPending(false);
    }
  };

  return (
    <a
      {...anchorProps}
      href={fallback}
      target={target}
      rel={target === "_blank" ? "noopener" : undefined}
      aria-busy={pending || undefined}
      onClick={onClick}
      className={cn(
        "text-primary underline-offset-4 hover:underline aria-busy:opacity-70",
        className,
      )}
    >
      {children}
    </a>
  );
}
