import { createFileRoute } from "@tanstack/react-router";

import { ChangelogSkeleton, ChangelogView } from "@/components/portal/changelog";
import { pageTitle } from "@/components/portal/route-head";
import { getChangelog } from "@/server/functions";

function parsePage(raw: unknown): number | undefined {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 1 && n <= 10_000 ? n : undefined;
}

export const Route = createFileRoute("/_portal/changelog/")({
  validateSearch: (raw: Record<string, unknown>): { page?: number } =>
    parsePage(raw.page) ? { page: parsePage(raw.page) } : {},
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getChangelog({ data: deps }),
  head: ({ matches }) => pageTitle(matches, "Changelog"),
  pendingComponent: ChangelogSkeleton,
  component: ChangelogPage,
});

function ChangelogPage() {
  const page = Route.useLoaderData();
  const navigate = Route.useNavigate();
  return (
    <ChangelogView
      page={page}
      onPage={(next) => void navigate({ search: { page: next > 1 ? next : undefined } })}
    />
  );
}
