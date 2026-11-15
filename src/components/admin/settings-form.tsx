import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type {
  AdminSettings,
  ModerationSettings,
  NotificationToggles,
  RuntimeSettings,
} from "@/contracts/admin";
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
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
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
  const [anonymous, setAnonymous] = React.useState(effective.anonymous);
  const [categories, setCategories] = React.useState<Category[]>(effective.categories);
  const [notifications, setNotifications] = React.useState(effective.notifications);
  const [autoDraft, setAutoDraft] = React.useState(effective.changelog.autoDraft);
  const [mode, setMode] = React.useState(effective.moderation.mode);
  const [blocked, setBlocked] = React.useState(effective.moderation.blockedWords.join("\n"));
  const [allowed, setAllowed] = React.useState(effective.moderation.allowedWords.join("\n"));
  const words = (value: string) => [
    ...new Set(
      value
        .split("\n")
        .map((word) => word.trim())
        .filter(Boolean),
    ),
  ];
  const moderation = { mode, blockedWords: words(blocked), allowedWords: words(allowed) };
  const wordProblem = [moderation.blockedWords, moderation.allowedWords].some(
    (list) =>
      list.length > 100 ||
      list.some((word) => Array.from(word).length > 64 || !/[\p{L}\p{N}]/u.test(word)),
  )
    ? "Use up to 100 words per list, at most 64 characters each."
    : null;
  const [saving, setSaving] = React.useState(false);

  const trimmed = name.trim();
  const nameProblem =
    trimmed.length < 1
      ? "Enter a name."
      : trimmed.length > NAME_MAX
        ? `Use at most ${NAME_MAX} characters.`
        : null;
  const current: RuntimeSettings = {
    moderation,
    name: trimmed,
    anonymous,
    categories: CATEGORIES.filter((category) => categories.includes(category)),
    notifications,
    changelog: { autoDraft },
  };
  const dirty = !same(current, effective);

  async function save(next: RuntimeSettings | "defaults") {
    setSaving(true);
    try {
      const target = next === "defaults" ? defaults : next;
      // An override equal to feedbax.config.ts is cleared, so the config stays the source.
      const patch = {
        moderation: {
          mode: same(target.moderation.mode, defaults.moderation.mode)
            ? null
            : target.moderation.mode,
          blockedWords: same(target.moderation.blockedWords, defaults.moderation.blockedWords)
            ? null
            : target.moderation.blockedWords,
          allowedWords: same(target.moderation.allowedWords, defaults.moderation.allowedWords)
            ? null
            : target.moderation.allowedWords,
        },
        name: same(target.name, defaults.name) ? null : target.name,
        anonymous: same(target.anonymous, defaults.anonymous) ? null : target.anonymous,
        categories: same(target.categories, defaults.categories) ? null : target.categories,
        notifications: Object.fromEntries(
          (Object.keys(target.notifications) as (keyof NotificationToggles)[]).map((key) => [
            key,
            target.notifications[key] === defaults.notifications[key]
              ? null
              : target.notifications[key],
          ]),
        ),
        changelog: {
          autoDraft:
            target.changelog.autoDraft === defaults.changelog.autoDraft
              ? null
              : target.changelog.autoDraft,
        },
      };
      const done = await act(
        () => adminSaveSettings({ data: patch }),
        next === "defaults" ? "Settings reset to the project defaults." : "Settings saved.",
      );
      if (done && next === "defaults") {
        setMode(done.effective.moderation.mode);
        setBlocked(done.effective.moderation.blockedWords.join("\n"));
        setAllowed(done.effective.moderation.allowedWords.join("\n"));
        setName(done.effective.name);
        setAnonymous(done.effective.anonymous);
        setCategories(done.effective.categories);
        setNotifications(done.effective.notifications);
        setAutoDraft(done.effective.changelog.autoDraft);
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
          if (nameProblem || wordProblem) return;
          if (categories.length === 0) {
            toast.error("Offer at least one category.");
            return;
          }
          void save(current);
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
                onChange={(event) => setName(event.target.value)}
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
                checked={anonymous}
                onChange={setAnonymous}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profanity filter</CardTitle>
            <CardDescription>
              Checks post titles, descriptions and comments locally. Admins bypass the filter.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${ids}-moderation`}>Filter mode</Label>
              <Select
                value={mode}
                disabled={saving}
                onValueChange={(value) => {
                  if (value) setMode(value as ModerationSettings["mode"]);
                }}
              >
                <SelectTrigger
                  id={`${ids}-moderation`}
                  aria-describedby={`${ids}-mode-hint`}
                  className="w-full max-md:h-11"
                >
                  <SelectValue>
                    {mode === "flag"
                      ? "Flag for review (default)"
                      : mode === "block"
                        ? "Block"
                        : "Off"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="flag">Flag for review (default)</SelectItem>
                  <SelectItem value="block">Block</SelectItem>
                  <SelectItem value="off">Off</SelectItem>
                </SelectContent>
              </Select>
              <p id={`${ids}-mode-hint`} className="text-xs text-muted-foreground">
                Flag holds feedback out of public view until you approve it in Moderation. Block
                asks the author to rephrase. Off skips the filter.
              </p>
            </div>
            {(
              [
                { label: "Custom blocked words", value: blocked, set: setBlocked, key: "blocked" },
                { label: "Allowed words", value: allowed, set: setAllowed, key: "allowed" },
              ] as const
            ).map((field) => (
              <div key={field.key} className="flex flex-col gap-1.5">
                <Label htmlFor={`${ids}-${field.key}`}>{field.label}</Label>
                <Textarea
                  id={`${ids}-${field.key}`}
                  value={field.value}
                  disabled={saving}
                  aria-describedby={`${ids}-words-hint`}
                  aria-invalid={wordProblem ? true : undefined}
                  onChange={(event) => field.set(event.target.value)}
                  className="max-md:text-base"
                />
              </div>
            ))}
            <p
              id={`${ids}-words-hint`}
              className={wordProblem ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
            >
              {wordProblem ??
                "One word or phrase per line, up to 100 per list. Allowed words override matching blocked words. Case and common obfuscations are ignored."}
            </p>
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
                      onCheckedChange={(next) =>
                        setCategories((prev) =>
                          next ? [...prev, category] : prev.filter((item) => item !== category),
                        )
                      }
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
              Saved now, used once email is set up with <code>npx feedbax add email</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y border-t">
            {TOGGLES.map((toggle) => (
              <ToggleRow
                key={toggle.key}
                id={`${ids}-${toggle.key}`}
                label={toggle.label}
                hint={toggle.hint}
                checked={notifications[toggle.key]}
                onChange={(next) => setNotifications((prev) => ({ ...prev, [toggle.key]: next }))}
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
              checked={autoDraft}
              onChange={setAutoDraft}
            />
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            disabled={!dirty || saving || nameProblem !== null || wordProblem !== null}
            className="h-9 max-md:h-11"
          >
            {saving ? "Saving…" : "Save changes"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            className="h-9 max-md:h-11"
            onClick={() => void save("defaults")}
          >
            Reset to project defaults
          </Button>
          <p className="text-xs text-muted-foreground">
            Changes reach every visitor within a few seconds. Secrets and integrations are never
            shown here.
          </p>
        </div>
      </form>

      <WebhooksSection webhooks={webhooks} />
    </div>
  );
}
