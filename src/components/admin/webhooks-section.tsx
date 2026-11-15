import * as React from "react";
import { useRouter } from "@tanstack/react-router";
import {
  BookOpenIcon,
  CopyIcon,
  EyeIcon,
  KeyRoundIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { hostOf, plural } from "@/components/portal/format";
import {
  WEBHOOK_EVENTS,
  WEBHOOK_EVENT_CATALOG,
  WEBHOOK_LIMITS,
  type AdminWebhooks,
  type WebhookDeliveryDetailView,
  type WebhookDeliveryStatus,
  type WebhookDeliveryView,
  type WebhookEndpointView,
  type WebhookEventType,
} from "@/contracts/webhooks";
import { webhookUrlProblem } from "@/lib/webhook-url";
import {
  adminWebhookCreate,
  adminWebhookDelete,
  adminWebhookDelivery,
  adminWebhookReplay,
  adminWebhookRevealSecret,
  adminWebhookRotateSecret,
  adminWebhooksList,
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

function canReplay(delivery: Pick<WebhookDeliveryView, "status" | "error">): boolean {
  return (
    delivery.status === "failed" ||
    (delivery.status === "pending" && delivery.error === "Could not be queued")
  );
}

function endpointLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname && parsed.pathname !== "/"
      ? `${parsed.host}${parsed.pathname}`
      : parsed.host;
  } catch {
    return hostOf(url);
  }
}

function formatPayload(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

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
            <div className="flex items-center justify-between gap-2">
              <legend className="text-sm font-medium">Events</legend>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() =>
                  setEvents(events.length === WEBHOOK_EVENTS.length ? [] : [...WEBHOOK_EVENTS])
                }
              >
                {events.length === WEBHOOK_EVENTS.length ? "Clear" : "Select all"}
              </Button>
            </div>
            <div className="flex flex-col divide-y border">
              {WEBHOOK_EVENT_CATALOG.map((entry) => (
                <label
                  key={entry.type}
                  className="flex items-start gap-3 px-3 py-2.5 text-sm max-md:min-h-11"
                >
                  <Checkbox
                    checked={events.includes(entry.type)}
                    className="mt-0.5"
                    onCheckedChange={(next) =>
                      setEvents((prev) =>
                        next ? [...prev, entry.type] : prev.filter((item) => item !== entry.type),
                      )
                    }
                  />
                  <span className="min-w-0">
                    <span className="block font-mono text-xs">{entry.type}</span>
                    <span className="block text-xs text-foreground">{entry.label}</span>
                    <span className="block text-xs text-muted-foreground">{entry.description}</span>
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

// ---- Event catalog ----

function CatalogDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  async function copyExample(type: WebhookEventType, json: string) {
    try {
      await navigator.clipboard.writeText(json);
      toast.success(`Copied ${type} example.`);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it instead.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Event catalog</DialogTitle>
          <DialogDescription>
            Every request sends a JSON envelope signed with{" "}
            <code>X-Feedbax-Signature: t=&lt;unix&gt;,v1=&lt;hmac-sha256&gt;</code>.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {WEBHOOK_EVENT_CATALOG.map((entry) => {
            const exampleJson = JSON.stringify(
              {
                id: "00000000-0000-4000-8000-000000000000",
                type: entry.type,
                createdAt: "2026-01-01T00:00:00.000Z",
                data: entry.example,
              },
              null,
              2,
            );
            return (
              <div key={entry.type} className="flex flex-col gap-2 border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-medium">{entry.type}</p>
                    <p className="text-xs text-foreground">{entry.label}</p>
                    <p className="text-xs text-muted-foreground">{entry.description}</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 shrink-0"
                    onClick={() => void copyExample(entry.type, exampleJson)}
                  >
                    <CopyIcon aria-hidden="true" /> Copy
                  </Button>
                </div>
                <pre className="overflow-x-auto border bg-muted/40 p-2.5 font-mono text-xs">
                  {exampleJson}
                </pre>
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClose} className="max-sm:h-11">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Delivery detail ----

function DeliveryDialog({
  deliveryId,
  replayingId,
  refreshKey,
  onClose,
  onReplay,
}: {
  deliveryId: string | null;
  replayingId: string | null;
  refreshKey: number;
  onClose: () => void;
  onReplay: (id: string) => Promise<void>;
}) {
  const [detail, setDetail] = React.useState<WebhookDeliveryDetailView | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminWebhookDelivery({ data: { id } });
      if (result.ok) setDetail(result.data);
      else setError(result.error.message);
    } catch {
      setError("Couldn't load delivery details.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!deliveryId) {
      setDetail(null);
      setError(null);
      return;
    }
    void load(deliveryId);
  }, [deliveryId, refreshKey, load]);

  const formattedPayload = React.useMemo(
    () => (detail ? formatPayload(detail.payload) : ""),
    [detail],
  );

  async function copyPayload() {
    if (!formattedPayload) return;
    try {
      await navigator.clipboard.writeText(formattedPayload);
      toast.success("Payload copied.");
    } catch {
      toast.error("Couldn't copy. Select the text and copy it instead.");
    }
  }

  return (
    <Dialog open={deliveryId !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Delivery details</DialogTitle>
          <DialogDescription>
            {detail ? (
              <span className="font-mono text-xs break-all">{detail.endpointUrl}</span>
            ) : (
              "Inspect delivery metadata and the signed JSON payload."
            )}
          </DialogDescription>
        </DialogHeader>
        {loading && !detail ? (
          <p className="py-6 text-sm text-muted-foreground">Loading delivery…</p>
        ) : error ? (
          <div className="flex flex-col gap-3 border p-4">
            <p className="text-sm text-destructive">{error}</p>
            {deliveryId ? (
              <div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void load(deliveryId)}
                >
                  Try again
                </Button>
              </div>
            ) : null}
          </div>
        ) : detail ? (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-1 gap-2 border p-3 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd className="mt-0.5 flex items-center gap-2">
                  <Badge variant={STATUS[detail.status].variant} className="h-6 px-2 font-normal">
                    {STATUS[detail.status].label}
                  </Badge>
                  {detail.responseStatus !== null ? (
                    <span className="font-mono">HTTP {detail.responseStatus}</span>
                  ) : null}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Event</dt>
                <dd className="mt-0.5 font-mono">{detail.event}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Attempts</dt>
                <dd className="mt-0.5">{detail.attempts}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Error</dt>
                <dd className="mt-0.5">{detail.error ?? "None"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Created</dt>
                <dd className="mt-0.5">
                  <time dateTime={detail.createdAt}>{formatTime(detail.createdAt)}</time>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Updated</dt>
                <dd className="mt-0.5">
                  <time dateTime={detail.updatedAt}>{formatTime(detail.updatedAt)}</time>
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Delivery ID</dt>
                <dd className="mt-0.5 font-mono break-all">{detail.id}</dd>
              </div>
            </dl>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium">Payload</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8"
                  onClick={() => void copyPayload()}
                >
                  <CopyIcon aria-hidden="true" /> Copy JSON
                </Button>
              </div>
              <pre className="max-h-72 overflow-auto border bg-muted/40 p-3 font-mono text-xs break-all whitespace-pre-wrap">
                {formattedPayload}
              </pre>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          {detail && canReplay(detail) ? (
            <Button
              type="button"
              variant="outline"
              disabled={replayingId === detail.id}
              className="max-sm:h-11"
              onClick={() => void onReplay(detail.id)}
            >
              <RotateCcwIcon aria-hidden="true" />
              {replayingId === detail.id ? "Replaying…" : "Replay"}
            </Button>
          ) : null}
          <Button type="button" onClick={onClose} className="max-sm:h-11">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Delivery log ----

function DeliveryRow({
  delivery,
  replaying,
  onInspect,
  onReplay,
}: {
  delivery: WebhookDeliveryView;
  replaying: boolean;
  onInspect: () => void;
  onReplay: () => void;
}) {
  const status = STATUS[delivery.status];
  const detail = [
    delivery.error,
    delivery.status !== "pending" || delivery.attempts > 1
      ? plural(delivery.attempts, "attempt")
      : null,
  ].filter(Boolean);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm">
      <Badge variant={status.variant} className="h-6 px-2 font-normal">
        {status.label}
      </Badge>
      <span className="font-mono text-xs">{delivery.event}</span>
      <span className="min-w-0 truncate text-xs text-muted-foreground">
        {endpointLabel(delivery.endpointUrl)}
      </span>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">
          {detail.length ? `${detail.join(" · ")} · ` : ""}
          <time dateTime={delivery.createdAt}>{formatTime(delivery.createdAt)}</time>
        </span>
        {canReplay(delivery) ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 max-md:h-10"
            disabled={replaying}
            onClick={onReplay}
          >
            <RotateCcwIcon aria-hidden="true" />
            {replaying ? "Replaying…" : "Replay"}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 max-md:h-10"
          onClick={onInspect}
        >
          <EyeIcon aria-hidden="true" /> Inspect
        </Button>
      </div>
    </li>
  );
}

type StatusFilter = "all" | WebhookDeliveryStatus;

export function WebhooksSection({ webhooks }: { webhooks: AdminWebhooks }) {
  const router = useRouter();
  const act = useAdminAction();
  const [editing, setEditing] = React.useState<WebhookEndpointView | "new" | null>(null);
  const [secret, setSecret] = React.useState<{ url: string; value: string } | null>(null);
  const [rotating, setRotating] = React.useState<WebhookEndpointView | null>(null);
  const [deleting, setDeleting] = React.useState<WebhookEndpointView | null>(null);
  const [catalogOpen, setCatalogOpen] = React.useState(false);
  const [inspectingId, setInspectingId] = React.useState<string | null>(null);
  const [replayingId, setReplayingId] = React.useState<string | null>(null);
  const [detailRefreshKey, setDetailRefreshKey] = React.useState(0);
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [endpointFilter, setEndpointFilter] = React.useState<string>("all");
  const [filteredDeliveries, setFilteredDeliveries] = React.useState<WebhookDeliveryView[] | null>(
    null,
  );
  const [filtering, setFiltering] = React.useState(false);
  const filterSeq = React.useRef(0);

  const { endpoints } = webhooks;
  const full = endpoints.length >= WEBHOOK_LIMITS.endpoints;
  const hasFilters = statusFilter !== "all" || endpointFilter !== "all";
  const deliveries = hasFilters ? (filteredDeliveries ?? []) : webhooks.deliveries;

  const loadDeliveries = React.useCallback(
    async (nextStatus: StatusFilter, nextEndpoint: string) => {
      const seq = ++filterSeq.current;
      if (nextStatus === "all" && nextEndpoint === "all") {
        setFilteredDeliveries(null);
        setFiltering(false);
        return;
      }
      setFiltering(true);
      try {
        const result = await adminWebhooksList({
          data: {
            ...(nextStatus === "all" ? {} : { status: nextStatus }),
            ...(nextEndpoint === "all" ? {} : { endpointId: nextEndpoint }),
          },
        });
        if (seq !== filterSeq.current) return;
        if (result.ok) setFilteredDeliveries(result.data.deliveries);
        else toast.error(result.error.message);
      } catch {
        if (seq === filterSeq.current) toast.error("Couldn't filter deliveries.");
      } finally {
        if (seq === filterSeq.current) setFiltering(false);
      }
    },
    [],
  );

  function changeFilters(nextStatus: StatusFilter, nextEndpoint: string) {
    setStatusFilter(nextStatus);
    setEndpointFilter(nextEndpoint);
    void loadDeliveries(nextStatus, nextEndpoint);
  }

  async function refreshDeliveries() {
    await Promise.all([
      router.invalidate(),
      hasFilters ? loadDeliveries(statusFilter, endpointFilter) : Promise.resolve(),
    ]);
  }

  async function replay(id: string) {
    if (replayingId) return;
    setReplayingId(id);
    try {
      const done = await act(
        () => adminWebhookReplay({ data: { id } }),
        "Delivery queued for replay.",
      );
      if (done) {
        if (hasFilters) await loadDeliveries(statusFilter, endpointFilter);
        if (inspectingId === id) setDetailRefreshKey((n) => n + 1);
      }
    } finally {
      setReplayingId(null);
    }
  }

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
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <CardTitle>
            <h2 id="webhooks-title" className="flex items-center gap-2 text-base">
              <WebhookIcon className="size-4" aria-hidden="true" /> Webhooks
            </h2>
          </CardTitle>
          <CardDescription>
            Send events to your own systems as they happen: new posts, status changes, comments,
            votes and published changelog entries. Each request is signed with that endpoint's
            secret.
          </CardDescription>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-9 shrink-0 max-md:h-11"
          onClick={() => setCatalogOpen(true)}
        >
          <BookOpenIcon aria-hidden="true" /> Event catalog
        </Button>
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-medium">Recent deliveries</h3>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  if (value) changeFilters(value as StatusFilter, endpointFilter);
                }}
              >
                <SelectTrigger
                  aria-label="Filter deliveries by status"
                  className="h-9 w-36 max-md:h-11"
                >
                  <SelectValue>
                    {statusFilter === "all" ? "All statuses" : STATUS[statusFilter].label}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
              {endpoints.length > 0 ? (
                <Select
                  value={endpointFilter}
                  onValueChange={(value) => {
                    if (value) changeFilters(statusFilter, value);
                  }}
                >
                  <SelectTrigger
                    aria-label="Filter deliveries by endpoint"
                    className="h-9 w-48 max-md:h-11"
                  >
                    <SelectValue>
                      {endpointFilter === "all"
                        ? "All endpoints"
                        : endpointLabel(
                            endpoints.find((e) => e.id === endpointFilter)?.url ?? endpointFilter,
                          )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All endpoints</SelectItem>
                    {endpoints.map((endpoint) => (
                      <SelectItem key={endpoint.id} value={endpoint.id}>
                        {endpointLabel(endpoint.url)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              <Button
                variant="ghost"
                className="h-9 max-md:h-11"
                aria-busy={filtering}
                onClick={() => void refreshDeliveries()}
              >
                <RefreshCwIcon aria-hidden="true" /> Refresh
              </Button>
            </div>
          </div>
          {filtering && deliveries.length === 0 ? (
            <p className="border p-4 text-sm text-muted-foreground">Loading deliveries…</p>
          ) : deliveries.length === 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border p-4 text-sm text-muted-foreground">
              <span>
                {hasFilters ? "No deliveries match these filters." : "No deliveries yet."}
              </span>
              {hasFilters ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => changeFilters("all", "all")}
                >
                  Clear filters
                </Button>
              ) : null}
            </div>
          ) : (
            <ul aria-label="Recent webhook deliveries" className="divide-y border">
              {deliveries.map((delivery) => (
                <DeliveryRow
                  key={delivery.id}
                  delivery={delivery}
                  replaying={replayingId === delivery.id}
                  onInspect={() => setInspectingId(delivery.id)}
                  onReplay={() => void replay(delivery.id)}
                />
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
      <CatalogDialog open={catalogOpen} onClose={() => setCatalogOpen(false)} />
      <DeliveryDialog
        deliveryId={inspectingId}
        replayingId={replayingId}
        refreshKey={detailRefreshKey}
        onClose={() => setInspectingId(null)}
        onReplay={replay}
      />
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
        onConfirm={async () => {
          const deleted =
            (await act(
              () => adminWebhookDelete({ data: { id: deleting!.id } }),
              "Endpoint deleted.",
            )) !== null;
          if (deleted && endpointFilter === deleting!.id) {
            changeFilters(statusFilter, "all");
          } else if (deleted && hasFilters) {
            void loadDeliveries(statusFilter, endpointFilter);
          }
          return deleted;
        }}
      />
    </Card>
  );
}
