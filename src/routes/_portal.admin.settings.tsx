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
  // Remount after a save so the form always starts from what the server stored.
  return (
    <section aria-label="Settings">
      <SettingsForm
        key={JSON.stringify(settings.effective)}
        settings={settings}
        webhooks={webhooks}
      />
    </section>
  );
}
