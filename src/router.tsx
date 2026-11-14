import {
  createRouter as createTanStackRouter,
  useRouter,
  type ErrorComponentProps,
} from "@tanstack/react-router";

import { ErrorState, NotFoundState } from "@/components/portal/states";
import { routeTree } from "./routeTree.gen";

function RouteError({ reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <ErrorState
      onRetry={() => {
        reset();
        void router.invalidate();
      }}
    />
  );
}

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    // Skeletons only appear when a load is actually slow, so fast navigations don't flash.
    defaultPendingMs: 300,
    defaultPendingMinMs: 300,
    defaultErrorComponent: RouteError,
    defaultNotFoundComponent: () => <NotFoundState />,
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
