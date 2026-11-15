import { createFileRoute, Outlet } from "@tanstack/react-router";

import { AdminNav } from "@/components/admin/admin-nav";
import { unwrap } from "@/components/admin/use-admin";
import { PageHeader } from "@/components/portal/page-header";
import { pageTitle } from "@/components/portal/route-head";
import { NotFoundState } from "@/components/portal/states";
import { adminSession } from "@/server/functions";

// The admin area. The guard is on the server: adminSession runs requireAdmin, and every
// admin function checks it again. A non-admin gets the same "not found" as any unknown URL.
export const Route = createFileRoute("/_portal/admin")({
  loader: () => unwrap(adminSession()),
  head: ({ matches }) => pageTitle(matches, "Admin"),
  notFoundComponent: () => <NotFoundState />,
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-6 md:py-10 lg:px-8">
      <PageHeader
        title="Admin"
        description="Moderate feedback, manage people and tune the portal."
      />
      <div className="mt-6">
        <AdminNav />
      </div>
      <div className="mt-6">
        <Outlet />
      </div>
    </div>
  );
}
