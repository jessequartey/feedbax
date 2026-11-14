import { createFileRoute } from "@tanstack/react-router";

import { SettingsForm } from "@/components/admin/settings-form";
import { unwrap } from "@/components/admin/use-admin";
import { adminGetSettings } from "@/server/functions";

export const Route = createFileRoute("/_portal/admin/settings")({
  loader: () => unwrap(adminGetSettings()),
  component: SettingsPage,
});

function SettingsPage() {
  const settings = Route.useLoaderData();
  // Remount after a save so the form always starts from what the server stored.
  return (
    <section aria-label="Settings">
      <SettingsForm key={JSON.stringify(settings.effective)} settings={settings} />
    </section>
  );
}
