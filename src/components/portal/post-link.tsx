import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { listDialogOptions } from "./list-dialog-navigation";

/** A real canonical href still supports copy-link, modifier-click and new tabs. */
export function PostLink({
  postId,
  children,
  className,
}: {
  postId: string;
  children: ReactNode;
  className?: string;
}) {
  const location = useRouterState({ select: (s) => s.location });
  const options = listDialogOptions(location, postId);
  return (
    <Link
      {...(options ?? { to: "/posts/$postId", params: { postId } })}
      onClick={(event) => event.currentTarget.focus({ preventScroll: true })}
      className={className}
    >
      {children}
    </Link>
  );
}
