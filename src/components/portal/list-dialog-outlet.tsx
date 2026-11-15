import { lazy, Suspense } from "react";
import { useRouterState } from "@tanstack/react-router";

const ListDialog = lazy(() => import("./list-dialog"));

/** Portal routes are client-only: no overlay data is read in the static shell. */
export function ListDialogOutlet({ dialog }: { dialog?: string }) {
  const masked = useRouterState({ select: (s) => Boolean(s.location.maskedLocation) });
  return dialog && masked ? (
    <Suspense>
      <ListDialog key={dialog} dialog={dialog} />
    </Suspense>
  ) : null;
}
