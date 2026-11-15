import * as React from "react";
import { useRouter } from "@tanstack/react-router";
import {
  CopyIcon,
  KeyRoundIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SendIcon,
  Trash2Icon,
  WebhookIcon,
} from "lucide-react";
import { toast } from "sonner";

import { useSwitches } from "@/components/use-switches";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { hostOf, plural } from "@/components/portal/format";
import {
  WEBHOOK_EVENTS,
  WEBHOOK_EVENT_LABELS,
  WEBHOOK_LIMITS,
  type AdminWebhooks,
  type WebhookDeliveryStatus,
  type WebhookDeliveryView,
  type WebhookEndpointView,
  type WebhookEventType,
} from "@/contracts/webhooks";
import { webhookUrlProblem } from "@/lib/webhook-url";
import {
  adminWebhookCreate,
  adminWebhookDelete,
  adminWebhookRevealSecret,
  adminWebhookRotateSecret,
  adminWebhookTest,
  adminWebhookUpdate,
} from "@/server/functions";
import { ConfirmDialog } from "./confirm-dialog";
import { useAdminAction } from "./use-admin";

const timeFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});
const formatTime = (iso: string) => `${timeFormat.format(new Date(iso))} UTC`;

const STATUS: Record<
  WebhookDeliveryStatus,
  { label: string; variant: "default" | "secondary" | "destructive" }
> = {
  delivered: { label: "Delivered", variant: "default" },
  pending: { label: "Pending", variant: "secondary" },
  failed: { label: "Failed", variant: "destructive" },
};

// ---- Add / edit ----

function EndpointDialog({
  editing,
  lenient,
  onClose,
  onCreated,
}: {
  /** An endpoint to edit, "new", or null when closed. */
  editing: WebhookEndpointView | "new" | null;
  lenient: boolean;
  onClose: () => void;
  onCreated: (url: string, secret: string) => void;
}) {
  const act = useAdminAction();
  const ids = React.useId();
  const endpoint = editing && editing !== "new" ? editing : null;
  const [url, setUrl] = React.useState("");
  const [events, setEvents] = React.useState<WebhookEventType[]>([...WEBHOOK_EVENTS]);
  const [touched, setTouched] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const key = editing === "new" ? "new" : (endpoint?.id ?? "");

  React.useEffect(() => {
    if (editing === null) return;
    setUrl(endpoint?.url ?? "");
    setEvents(endpoint?.events ?? [...WEBHOOK_EVENTS]);
    setTouched(false);
    // Reset only when a different endpoint (or "new") is opened.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const problem = webhookUrlProblem(url.trim(), lenient);
  const eventsProblem = events.length === 0 ? "Choose at least one event." : null;

  async function save() {
    setTouched(true);
    if (problem || eventsProblem) return;
    setPending(true);
    try {
      const chosen = WEBHOOK_EVENTS.filter((event) => events.includes(event));
      if (endpoint) {
        const done = await act(
          () => adminWebhookUpdate({ data: { id: endpoint.id, url: url.trim(), events: chosen } }),
          "Endpoint saved.",
        );
        if (done) onClose();
      } else {
        const done = await act(
          () => adminWebhookCreate({ data: { url: url.trim(), events: chosen } }),
          "Endpoint added.",
        );
        if (done) {
          onClose();
          onCreated(done.endpoint.url, done.secret);
        }
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={editing !== null}
      onOpenChange={(open) => (open || pending ? undefined : onClose())}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{endpoint ? "Edit endpoint" : "Add endpoint"}</DialogTitle>
          <DialogDescription>
            Feedbax sends a signed JSON POST to this address for the events you pick.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-5"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-url`}>Endpoint URL</Label>
            <Input
              id={`${ids}-url`}
              type="url"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              value={url}
              maxLength={WEBHOOK_LIMITS.url}
              placeholder="https://example.com/feedbax"
              aria-invalid={touched && problem ? true : undefined}
              aria-describedby={`${ids}-url-hint`}
              onBlur={() => setTouched(true)}
              onChange={(event) => setUrl(event.target.value)}
              className="h-9 font-mono max-md:h-11 max-md:text-base"
            />
            <p
              id={`${ids}-url-hint`}
              className={
                touched && problem ? "text-xs text-destructive" : "text-xs text-muted-foreground"
              }
            >
              {touched && problem
                ? problem
                : lenient
                  ? "Local development: http and local addresses are allowed."
                  : "A public https address."}
            </p>
          </div>
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-sm font-medium">Events</legend>
            <div className="flex flex-col divide-y border">
              {WEBHOOK_EVENTS.map((event) => (
                <label
                  key={event}
                  className="flex items-center gap-3 px-3 py-2.5 text-sm max-md:min-h-11"
                >
                  <Checkbox
                    checked={events.includes(event)}
                    onCheckedChange={(next) =>
                      setEvents((prev) =>
                        next ? [...prev, event] : prev.filter((item) => item !== event),
                      )
                    }
                  />
                  <span className="min-w-0">
                    <span className="block font-mono text-xs">{event}</span>
                    <span className="block text-xs text-muted-foreground">
                      {WEBHOOK_EVENT_LABELS[event]}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            {touched && eventsProblem ? (
              <p className="text-xs text-destructive">{eventsProblem}</p>
            ) : null}
          </fieldset>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={onClose}
              className="max-sm:h-11"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending} className="max-sm:h-11">
              {pending ? "Saving…" : endpoint ? "Save changes" : "Add endpoint"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- The signing secret ----

function SecretDialog({
  secret,
  onClose,
}: {
  secret: { url: string; value: string } | null;
  onClose: () => void;
}) {
  const ids = React.useId();
  async function copy() {
    try {
      await navigator.clipboard.writeText(secret!.value);
      toast.success("Secret copied.");
    } catch {
      toast.error("Couldn't copy. Select the text and copy it instead.");
    }
  }
  return (
    <Dialog open={secret !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Signing secret</DialogTitle>
          <DialogDescription>
            {secret ? `For ${hostOf(secret.url)}. ` : ""}
            Receivers use it to check the <code>X-Feedbax-Signature</code> header. Keep it private;
            you can show it again from the endpoint's menu.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${ids}-secret`}>Secret</Label>
          <div className="flex gap-2">
            <Input
              id={`${ids}-secret`}
              readOnly
              value={secret?.value ?? ""}
              onFocus={(event) => event.currentTarget.select()}
              className="h-9 font-mono max-md:h-11 max-md:text-base"
            />
            <Button
              type="button"
              variant="outline"
              className="h-9 shrink-0 max-md:h-11"
              onClick={() => void copy()}
            >
              <CopyIcon aria-hidden="true" /> Copy
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClose} className="max-sm:h-11">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Endpoints ----

function EndpointRow({
  endpoint,
  onEdit,
  onSecret,
  onRotate,
  onDelete,
}: {
  endpoint: WebhookEndpointView;
  onEdit: () => void;
  onSecret: () => void;
  onRotate: () => void;
  onDelete: () => void;
}) {
  const act = useAdminAction();
  const { values, pending, change } = useSwitches(
    { enabled: endpoint.enabled },
    async (_, next) => {
      const result = await adminWebhookUpdate({ data: { id: endpoint.id, enabled: next } });
      if (!result.ok) throw new Error(result.error.message);
    },
  );
  const label = `Send events to ${hostOf(endpoint.url)}`;
  return (
    <li className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:gap-5">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-sm break-all">{endpoint.url}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {endpoint.events.length === WEBHOOK_EVENTS.length
            ? "All events"
            : plural(endpoint.events.length, "event")}
          {endpoint.last
            ? ` · last delivery ${STATUS[endpoint.last.status].label.toLowerCase()}`
            : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Switch
          checked={values.enabled}
          aria-busy={pending.has("enabled")}
          aria-label={label}
          onCheckedChange={(next) => void change("enabled", next)}
        />
        <Button
          variant="outline"
          className="h-9 max-md:h-11"
          disabled={!values.enabled || pending.has("enabled")}
          onClick={() =>
            void act(
              () => adminWebhookTest({ data: { id: endpoint.id } }),
              "Test queued. It shows in the delivery log shortly.",
            )
          }
        >
          <SendIcon aria-hidden="true" /> Send test
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                aria-label={`More actions for ${hostOf(endpoint.url)}`}
                className="size-9 max-md:size-11"
              />
            }
          >
            <MoreHorizontalIcon aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            <DropdownMenuItem onClick={onEdit}>
              <PencilIcon aria-hidden="true" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onSecret}>
              <KeyRoundIcon aria-hidden="true" /> Show signing secret
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onRotate}>
              <RefreshCwIcon aria-hidden="true" /> Rotate secret
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onDelete}>
              <Trash2Icon aria-hidden="true" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

// ---- Delivery log ----

function DeliveryRow({ delivery }: { delivery: WebhookDeliveryView }) {
  const status = STATUS[delivery.status];
  const detail = [
    delivery.error,
    delivery.status !== "pending" || delivery.attempts > 1
      ? plural(delivery.attempts, "attempt")
      : null,
  ].filter(Boolean);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
      <Badge variant={status.variant} className="h-6 px-2 font-normal">
        {status.label}
      </Badge>
      <span className="font-mono text-xs">{delivery.event}</span>
      <span className="min-w-0 truncate text-xs text-muted-foreground">
        {hostOf(delivery.endpointUrl)}
      </span>
      <span className="ml-auto text-xs text-muted-foreground">
        {detail.length ? `${detail.join(" · ")} · ` : ""}
        <time dateTime={delivery.createdAt}>{formatTime(delivery.createdAt)}</time>
      </span>
    </li>
  );
}

export function WebhooksSection({ webhooks }: { webhooks: AdminWebhooks }) {
  const router = useRouter();
  const act = useAdminAction();
  const [editing, setEditing] = React.useState<WebhookEndpointView | "new" | null>(null);
  const [secret, setSecret] = React.useState<{ url: string; value: string } | null>(null);
  const [rotating, setRotating] = React.useState<WebhookEndpointView | null>(null);
  const [deleting, setDeleting] = React.useState<WebhookEndpointView | null>(null);
  const { endpoints, deliveries } = webhooks;
  const full = endpoints.length >= WEBHOOK_LIMITS.endpoints;

  async function reveal(endpoint: WebhookEndpointView) {
    // Not toasted: the dialog is the result.
    try {
      const result = await adminWebhookRevealSecret({ data: { id: endpoint.id } });
      if (result.ok) setSecret({ url: endpoint.url, value: result.data.secret });
      else toast.error(result.error.message);
    } catch {
      toast.error("Something went wrong. Please try again.");
    }
  }

  return (
    <Card id="webhooks" aria-labelledby="webhooks-title">
      <CardHeader>
        <CardTitle>
          <h2 id="webhooks-title" className="flex items-center gap-2 text-base">
            <WebhookIcon className="size-4" aria-hidden="true" /> Webhooks
          </h2>
        </CardTitle>
        <CardDescription>
          Send events to your own systems as they happen: new posts, status changes, comments, votes
          and published changelog entries. Each request is signed with that endpoint's secret.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium">Endpoints</h3>
            <Button
              variant="outline"
              className="h-9 max-md:h-11"
              disabled={full}
              onClick={() => setEditing("new")}
            >
              <PlusIcon aria-hidden="true" /> Add endpoint
            </Button>
          </div>
          {endpoints.length === 0 ? (
            <p className="border p-4 text-sm text-muted-foreground">
              No endpoints yet. Nothing is sent until you add one.
            </p>
          ) : (
            <ul aria-label="Webhook endpoints" className="divide-y border">
              {endpoints.map((endpoint) => (
                <EndpointRow
                  key={endpoint.id}
                  endpoint={endpoint}
                  onEdit={() => setEditing(endpoint)}
                  onSecret={() => void reveal(endpoint)}
                  onRotate={() => setRotating(endpoint)}
                  onDelete={() => setDeleting(endpoint)}
                />
              ))}
            </ul>
          )}
          {full ? (
            <p className="text-xs text-muted-foreground">
              You can add up to {WEBHOOK_LIMITS.endpoints} endpoints.
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-medium">Recent deliveries</h3>
            <Button
              variant="ghost"
              className="h-9 max-md:h-11"
              onClick={() => void router.invalidate()}
            >
              <RefreshCwIcon aria-hidden="true" /> Refresh
            </Button>
          </div>
          {deliveries.length === 0 ? (
            <p className="border p-4 text-sm text-muted-foreground">No deliveries yet.</p>
          ) : (
            <ul aria-label="Recent webhook deliveries" className="divide-y border">
              {deliveries.map((delivery) => (
                <DeliveryRow key={delivery.id} delivery={delivery} />
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Failed attempts are retried up to {WEBHOOK_LIMITS.attempts} times in all. The last{" "}
            {WEBHOOK_LIMITS.historyPerEndpoint} deliveries per endpoint are kept.
          </p>
        </div>
      </CardContent>

      <EndpointDialog
        editing={editing}
        lenient={webhooks.lenient}
        onClose={() => setEditing(null)}
        onCreated={(url, value) => setSecret({ url, value })}
      />
      <SecretDialog secret={secret} onClose={() => setSecret(null)} />
      <ConfirmDialog
        open={rotating !== null}
        onOpenChange={(open) => (open ? undefined : setRotating(null))}
        title="Rotate the signing secret?"
        description={
          <>
            {rotating ? `${hostOf(rotating.url)} ` : "The endpoint "}
            will receive requests signed with a new secret. Update your receiver right after, or its
            checks will fail.
          </>
        }
        confirmLabel="Rotate secret"
        onConfirm={async () => {
          const done = await act(
            () => adminWebhookRotateSecret({ data: { id: rotating!.id } }),
            "Secret rotated.",
          );
          if (done) setSecret({ url: rotating!.url, value: done.secret });
          return done !== null;
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => (open ? undefined : setDeleting(null))}
        title="Delete this endpoint?"
        description={
          <>
            {deleting ? `${hostOf(deleting.url)} ` : "The endpoint "}
            stops receiving events and its delivery log is removed.
          </>
        }
        confirmLabel="Delete endpoint"
        destructive
        onConfirm={async () =>
          (await act(
            () => adminWebhookDelete({ data: { id: deleting!.id } }),
            "Endpoint deleted.",
          )) !== null
        }
      />
    </Card>
  );
}
