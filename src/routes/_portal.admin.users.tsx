import { createFileRoute } from "@tanstack/react-router";

import { unwrap } from "@/components/admin/use-admin";
import { UserManagement } from "@/components/admin/users";
import type { UserFilter } from "@/contracts/admin";
import { adminListUsers } from "@/server/functions";

type UsersSearch = { q?: string; filter?: "admin" | "banned"; page?: number };

function parsePage(raw: unknown): number | undefined {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 1 && n <= 10_000 ? n : undefined;
}

export const Route = createFileRoute("/_portal/admin/users")({
  validateSearch: (raw: Record<string, unknown>): UsersSearch => {
    const q = (typeof raw.q === "string" ? raw.q : typeof raw.q === "number" ? String(raw.q) : "")
      .trim()
      .slice(0, 100);
    return {
      ...(q ? { q } : {}),
      ...(raw.filter === "admin" || raw.filter === "banned" ? { filter: raw.filter } : {}),
      ...(parsePage(raw.page) ? { page: parsePage(raw.page) } : {}),
    };
  },
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => unwrap(adminListUsers({ data: deps })),
  component: UsersPage,
});

function UsersPage() {
  const page = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <section aria-label="Users">
      <UserManagement
        page={page}
        q={search.q}
        filter={(search.filter ?? "all") as UserFilter}
        onQuery={(q) =>
          void navigate({ search: (prev) => ({ ...prev, q, page: undefined }), replace: true })
        }
        onFilter={(filter) =>
          void navigate({
            search: (prev) => ({
              ...prev,
              filter: filter === "all" ? undefined : filter,
              page: undefined,
            }),
            replace: true,
          })
        }
        onPage={(next) =>
          void navigate({ search: (prev) => ({ ...prev, page: next > 1 ? next : undefined }) })
        }
      />
    </section>
  );
}
