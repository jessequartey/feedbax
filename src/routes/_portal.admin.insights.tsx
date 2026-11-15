import { createFileRoute, useRouter, useRouterState } from "@tanstack/react-router";

import { InsightsDashboard, InsightsPending } from "@/components/admin/insights";
import { unwrap } from "@/components/admin/use-admin";
import { ErrorState } from "@/components/portal/states";
import type { InsightsRange } from "@/contracts/admin";
import { adminInsights } from "@/server/functions";

type InsightsSearch = { range?: InsightsRange };

export const Route = createFileRoute("/_portal/admin/insights")({
  validateSearch: (raw: Record<string, unknown>): InsightsSearch =>
    raw.range === "7d" || raw.range === "90d" || raw.range === "all" ? { range: raw.range } : {},
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => unwrap(adminInsights({ data: deps.range ? { range: deps.range } : {} })),
  pendingComponent: InsightsPending,
  errorComponent: InsightsError,
  component: InsightsPage,
});

function InsightsError({ reset }: { reset: () => void }) {
  const router = useRouter();
  return (
    <ErrorState
      title="Couldn't load insights"
      description="We couldn't load admin insights right now. Try again."
      onRetry={() => {
        reset();
        void router.invalidate();
      }}
    />
  );
}

function InsightsPage() {
  const insights = Route.useLoaderData();
  const navigate = Route.useNavigate();
  const isLoading = useRouterState({ select: (s) => s.isLoading });
  return (
    <section aria-label="Insights">
      <InsightsDashboard
        insights={insights}
        isPending={isLoading}
        onRangeChange={(range) =>
          void navigate({
            search: range === "30d" ? {} : { range },
            replace: true,
          })
        }
      />
    </section>
  );
}
