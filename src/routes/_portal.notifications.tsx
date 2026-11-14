import { createFileRoute, Link } from "@tanstack/react-router";
import { UserIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { NotificationSettings } from "@/components/portal/notification-settings";
import { PageHeader } from "@/components/portal/page-header";
import { pageTitle } from "@/components/portal/route-head";
import { EmptyState, ErrorState } from "@/components/portal/states";
import { getEmailPreferences } from "@/server/functions";

export const Route = createFileRoute("/_portal/notifications")({
  loader: () => getEmailPreferences(),
  head: ({ matches }) => pageTitle(matches, "Email notifications"),
  component: NotificationsPage,
});

function NotificationsPage() {
  const result = Route.useLoaderData();
  const router = Route.useNavigate();
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6 md:py-10">
      <PageHeader title="Email notifications" description="Choose what lands in your inbox." />
      <div className="mt-8">
        {result.ok ? (
          <NotificationSettings settings={result.data} />
        ) : result.error.code === "unauthenticated" ? (
          <div className="border">
            <EmptyState
              icon={UserIcon}
              title="Sign in to choose your emails"
              description="Email notifications belong to your account."
              actions={
                <Button
                  render={<Link to="/login" search={{ to: "/notifications" }} />}
                  nativeButton={false}
                  className="max-md:h-11"
                >
                  Sign in
                </Button>
              }
            />
          </div>
        ) : (
          <ErrorState
            description={result.error.message}
            onRetry={() => void router({ to: "/notifications" })}
          />
        )}
      </div>
    </div>
  );
}
