import { createFileRoute } from "@tanstack/react-router";

import { SettingsForm } from "@/components/admin/settings-form";
import { unwrap } from "@/components/admin/use-admin";
import { adminGetSettings, adminWebhooksList } from "@/server/functions";

export const Route = createFileRoute("/_portal/admin/settings")({
  loader: async () => {
    const [settings, webhooks] = await Promise.all([
      unwrap(adminGetSettings()),
      unwrap(adminWebhooksList()),
    ]);
    return { settings, webhooks };
  },
  component: SettingsPage,
});

function SettingsPage() {
  const { settings, webhooks } = Route.useLoaderData();
  // Keep in-flight switch writes and edits alive when a save refreshes the loader.
  return (
    <section aria-label="Settings">
      <SettingsForm settings={settings} webhooks={webhooks} />
    </section>
  );
}
