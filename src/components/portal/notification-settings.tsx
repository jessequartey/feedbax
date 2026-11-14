import * as React from "react";
import { MailIcon } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import type { EmailPrefs, EmailSettings } from "@/contracts/portal";
import { saveEmailPreferences } from "@/server/functions";
import { EmptyState } from "./states";

export const EMAIL_LABELS: Record<keyof EmailPrefs, { label: string; hint: string }> = {
  status: { label: "Status changes", hint: "When a post you wrote or voted on moves." },
  replies: { label: "Replies", hint: "When someone comments on a post you wrote or commented on." },
  changelog: { label: "Changelog entries", hint: "When a new entry is published." },
  digest: { label: "Admin digest", hint: "A daily summary of new posts. Admins only." },
};

/** Your email choices: one switch each, saved as soon as it changes. */
export function NotificationSettings({ settings }: { settings: EmailSettings }) {
  const [prefs, setPrefs] = React.useState(settings.prefs);
  const [saving, setSaving] = React.useState<keyof EmailPrefs | null>(null);
  const ids = React.useId();

  if (!settings.enabled)
    return (
      <div className="border">
        <EmptyState
          icon={MailIcon}
          title="Email notifications are off"
          description="This portal doesn't send email. Nothing to set up here."
        />
      </div>
    );
  if (!settings.address)
    return (
      <div className="border">
        <EmptyState
          icon={MailIcon}
          title="No email address on this account"
          description="Email goes to people who signed in with GitHub or Google. Sign in that way to choose what you get."
        />
      </div>
    );

  const change = async (key: keyof EmailPrefs, next: boolean) => {
    const before = prefs[key];
    setPrefs((current) => ({ ...current, [key]: next }));
    setSaving(key);
    try {
      const result = await saveEmailPreferences({ data: { [key]: next } });
      if (!result.ok) throw new Error(result.error.message);
      setPrefs(result.data.prefs);
    } catch {
      setPrefs((current) => ({ ...current, [key]: before }));
      toast.error("Couldn't save that. Please try again.");
    } finally {
      setSaving(null);
    }
  };

  const keys = (Object.keys(EMAIL_LABELS) as (keyof EmailPrefs)[]).filter(
    (key) => key !== "digest" || settings.admin,
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Email</CardTitle>
        <CardDescription>
          Sent to <span className="font-medium text-foreground">{settings.address}</span>. Every
          email has an unsubscribe link.
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y border-t">
        {keys.map((key) => (
          <div key={key} className="flex items-center justify-between gap-6 py-3">
            <div className="min-w-0">
              <p id={`${ids}-${key}`} className="text-sm font-medium">
                {EMAIL_LABELS[key].label}
              </p>
              <p className="text-sm text-muted-foreground">{EMAIL_LABELS[key].hint}</p>
            </div>
            <Switch
              checked={prefs[key]}
              disabled={saving === key}
              onCheckedChange={(next) => void change(key, next)}
              aria-labelledby={`${ids}-${key}`}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
