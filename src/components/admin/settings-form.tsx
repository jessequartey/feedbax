import * as React from "react";
import { toast } from "sonner";

import { useSwitches } from "@/components/use-switches";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { AdminSettings, NotificationToggles } from "@/contracts/admin";
import type { AdminWebhooks } from "@/contracts/webhooks";
import { CATEGORY_LABELS, type Category } from "@/contracts/domain";
import { CATEGORY_ICONS } from "@/components/portal/post-badges";
import { adminSaveSettings } from "@/server/functions";
import { useAdminAction } from "./use-admin";
import { WebhooksSection } from "./webhooks-section";

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];
const TOGGLES: { key: keyof NotificationToggles; label: string; hint: string }[] = [
  {
    key: "statusChanges",
    label: "Status changes",
    hint: "When a post you wrote or voted on moves.",
  },
  { key: "replies", label: "Replies", hint: "When someone replies to your comment." },
  { key: "changelog", label: "Changelog entries", hint: "Only for people who opted in." },
  { key: "adminDigest", label: "Admin digest", hint: "A summary of new posts for admins." },
];
const NAME_MAX = 60;

function same<T>(a: T, b: T) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  onChange,
  pending,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  pending?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-3">
      <div className="min-w-0">
        <p id={`${id}-label`} className="text-sm font-medium">
          {label}
        </p>
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      </div>
      <Switch
        checked={checked}
        aria-busy={pending}
        onCheckedChange={onChange}
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-hint`}
      />
    </div>
  );
}

/** Edits the D1 runtime overrides. Values equal to feedbax.config.ts clear the override. */
export function SettingsForm({
  settings,
  webhooks,
}: {
  settings: AdminSettings;
  webhooks: AdminWebhooks;
}) {
  const { effective, defaults } = settings;
  const act = useAdminAction();
  const ids = React.useId();
  const [name, setName] = React.useState(effective.name);
  const [categories, setCategories] = React.useState<Category[]>(effective.categories);
  const switches = useSwitches(
    {
      anonymous: effective.anonymous,
      ...effective.notifications,
      autoDraft: effective.changelog.autoDraft,
    },
    async (key, value) => {
      const patch =
        key === "anonymous"
          ? { anonymous: value === defaults.anonymous ? null : value }
          : key === "autoDraft"
            ? { changelog: { autoDraft: value === defaults.changelog.autoDraft ? null : value } }
            : { notifications: { [key]: value === defaults.notifications[key] ? null : value } };
      const result = await adminSaveSettings({ data: patch });
      if (!result.ok) throw new Error(result.error.message);
    },
  );
  // A reset response must not replace text/category edits made while it was saving.
  const edits = React.useRef(0);
  const [saving, setSaving] = React.useState(false);

  const trimmed = name.trim();
  const nameProblem =
    trimmed.length < 1
      ? "Enter a name."
      : trimmed.length > NAME_MAX
        ? `Use at most ${NAME_MAX} characters.`
        : null;
  const current = {
    name: trimmed,
    categories: CATEGORIES.filter((category) => categories.includes(category)),
  };
  const dirty = current.name !== effective.name || !same(current.categories, effective.categories);

  async function save(reset = false) {
    if (saving) return;
    const revision = edits.current;
    setSaving(true);
    try {
      const target = reset ? defaults : current;
      if (reset) {
        const results = await Promise.all([
          switches.change("anonymous", defaults.anonymous),
          switches.change("autoDraft", defaults.changelog.autoDraft),
          ...TOGGLES.map(({ key }) => switches.change(key, defaults.notifications[key])),
        ]);
        // Each failed switch already explains its rollback. Do not announce a full reset.
        if (results.some((saved) => !saved)) return;
      }
      const done = await act(
        () =>
          adminSaveSettings({
            data: {
              name: same(target.name, defaults.name) ? null : target.name,
              categories: same(target.categories, defaults.categories) ? null : target.categories,
            },
          }),
        reset ? "Settings reset to the project defaults." : "Settings saved.",
      );
      if (done && reset && revision === edits.current) {
        setName(done.effective.name);
        setCategories(done.effective.categories);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <form
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (nameProblem) return;
          if (categories.length === 0) {
            toast.error("Offer at least one category.");
            return;
          }
          void save();
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Portal</CardTitle>
            <CardDescription>What visitors see and how they can take part.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-name`}>Portal name</Label>
              <Input
                id={`${ids}-name`}
                value={name}
                maxLength={NAME_MAX + 20}
                aria-invalid={nameProblem ? true : undefined}
                aria-describedby={`${ids}-name-hint`}
                onChange={(event) => {
                  edits.current += 1;
                  setName(event.target.value);
                }}
                className="h-9 max-md:h-11 max-md:text-base"
              />
              <p
                id={`${ids}-name-hint`}
                className={
                  nameProblem ? "text-xs text-destructive" : "text-xs text-muted-foreground"
                }
              >
                {nameProblem ?? "Shown in the header and in page titles."}
              </p>
            </div>
            <div className="border-t">
              <ToggleRow
                id={`${ids}-anon`}
                label="Anonymous feedback"
                hint="Let people post, vote and comment without signing in. People already signed in stay signed in."
                checked={switches.values.anonymous}
                pending={switches.pending.has("anonymous")}
                onChange={(next) => void switches.change("anonymous", next)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Categories</CardTitle>
            <CardDescription>
              The categories offered on the post form and in the filters. Existing posts keep
              theirs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <fieldset className="flex flex-col divide-y border">
              <legend className="sr-only">Visible categories</legend>
              {CATEGORIES.map((category) => {
                const Icon = CATEGORY_ICONS[category];
                const checked = categories.includes(category);
                const only = checked && categories.length === 1;
                return (
                  <label
                    key={category}
                    className="flex items-center gap-3 px-3 py-3 text-sm max-md:min-h-11"
                  >
                    <Checkbox
                      checked={checked}
                      disabled={only}
                      onCheckedChange={(next) => {
                        edits.current += 1;
                        setCategories((prev) =>
                          next ? [...prev, category] : prev.filter((item) => item !== category),
                        );
                      }}
                    />
                    <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                    {CATEGORY_LABELS[category]}
                    {only ? (
                      <span className="ml-auto text-xs text-muted-foreground">
                        At least one is required
                      </span>
                    ) : null}
                  </label>
                );
              })}
            </fieldset>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notifications</CardTitle>
            <CardDescription>
              Used once email is set up with <code>npx feedbax add email</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y border-t">
            {TOGGLES.map((toggle) => (
              <ToggleRow
                key={toggle.key}
                id={`${ids}-${toggle.key}`}
                label={toggle.label}
                hint={toggle.hint}
                checked={switches.values[toggle.key]}
                pending={switches.pending.has(toggle.key)}
                onChange={(next) => void switches.change(toggle.key, next)}
              />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Changelog</CardTitle>
            <CardDescription>
              Entries are written in the Changelog tab and published at <code>/changelog</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="border-t">
            <ToggleRow
              id={`${ids}-autodraft`}
              label="Draft an entry when a post is Done"
              hint="Creates a draft called “Shipped: …” that links the post. Nothing is published until you publish it."
              checked={switches.values.autoDraft}
              pending={switches.pending.has("autoDraft")}
              onChange={(next) => void switches.change("autoDraft", next)}
            />
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            disabled={!dirty || saving || nameProblem !== null}
            className="h-9 max-md:h-11"
          >
            {saving ? "Saving…" : "Save changes"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            className="h-9 max-md:h-11"
            onClick={() => void save(true)}
          >
            Reset to project defaults
          </Button>
          <p className="text-xs text-muted-foreground">
            Switches save immediately. Save changes to the name and categories. Secrets and
            integrations are never shown here.
          </p>
        </div>
      </form>

      <WebhooksSection webhooks={webhooks} />
    </div>
  );
}
