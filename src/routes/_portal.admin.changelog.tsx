import { createFileRoute } from "@tanstack/react-router";

import { ChangelogAdmin } from "@/components/admin/changelog";
import { unwrap } from "@/components/admin/use-admin";
import { adminChangelogList } from "@/server/functions";

function parsePage(raw: unknown): number | undefined {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 1 && n <= 10_000 ? n : undefined;
}

export const Route = createFileRoute("/_portal/admin/changelog")({
  validateSearch: (raw: Record<string, unknown>): { page?: number } =>
    parsePage(raw.page) ? { page: parsePage(raw.page) } : {},
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => unwrap(adminChangelogList({ data: deps })),
  component: ChangelogAdminPage,
});

function ChangelogAdminPage() {
  const page = Route.useLoaderData();
  const navigate = Route.useNavigate();
  return (
    <section aria-label="Changelog">
      <ChangelogAdmin
        page={page}
        onPage={(next) => void navigate({ search: { page: next > 1 ? next : undefined } })}
      />
    </section>
  );
}
