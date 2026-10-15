import { Bell, Loader2 } from "lucide-react";
import { useState } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Button } from "@feedbax/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@feedbax/ui/components/dialog";
import { Label } from "@feedbax/ui/components/label";
import { Switch } from "@feedbax/ui/components/switch";
import { useConnectedIdentity } from "./connected-identity-provider";
import {
  notificationQuery,
  participationRequest,
  preferencesQuery,
  type EmailPreferences,
} from "../participation-client";
import { formatPublicDate } from "../public-date";

export function NotificationInbox() {
  const identity = useConnectedIdentity();
  if (!identity.enabled || !identity.displayName) return null;
  return <ConnectedNotificationInbox />;
}
function ConnectedNotificationInbox() {
  const identity = useConnectedIdentity();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const queryClient = useQueryClient();
  const enabled = identity.enabled && Boolean(identity.displayName);
  const inbox = useInfiniteQuery({
    ...notificationQuery,
    enabled,
    refetchInterval: enabled ? 60000 : false,
  });
  const preferences = useQuery({
    ...preferencesQuery(),
    enabled: enabled && open,
  });
  if (!enabled) return null;
  const items = inbox.data?.pages.flatMap((page) => page.items) ?? [];
  const unread = inbox.data?.pages[0]?.unreadCount ?? 0;
  async function read(id?: string) {
    setError(undefined);
    try {
      await participationRequest("notifications", id ? { id } : {});
      await queryClient.invalidateQueries({
        queryKey: notificationQuery.queryKey,
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Couldn’t mark updates as read.",
      );
    }
  }
  async function email(enabled: boolean) {
    setError(undefined);
    setPending(true);
    try {
      const next = await participationRequest<EmailPreferences>("preferences", {
        emailEnabled: enabled,
      });
      queryClient.setQueryData(preferencesQuery().queryKey, next);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Couldn’t save email preferences.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={
              unread ? `Notifications, ${unread} unread` : "Notifications"
            }
            className="relative"
          />
        }
      >
        <Bell aria-hidden="true" />
        {unread ? (
          <span className="absolute top-1 right-1 size-2 rounded-full bg-primary" />
        ) : null}
      </DialogTrigger>
      <DialogContent className="max-h-[85svh] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b p-5">
          <DialogTitle className="text-lg">Notifications</DialogTitle>
          <DialogDescription className="text-sm">
            Updates on Posts you follow.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
          <span className="text-sm text-muted-foreground">{unread} unread</span>
          <Button
            size="sm"
            variant="ghost"
            disabled={!unread}
            onClick={() => void read()}
          >
            Mark all read
          </Button>
        </div>
        <div className="max-h-[45svh] overflow-y-auto">
          {inbox.isPending ? (
            <p role="status" className="flex items-center gap-2 p-5 text-sm">
              <Loader2 className="size-4 animate-spin" />
              Loading updates…
            </p>
          ) : inbox.isError ? (
            <div className="space-y-3 p-5">
              <p className="text-sm">Couldn’t load updates.</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void inbox.refetch()}
              >
                Try again
              </Button>
            </div>
          ) : items.length ? (
            <ul className="divide-y">
              {items.map((item) => (
                <li
                  key={item.id}
                  className={item.read ? "p-5" : "bg-muted/40 p-5"}
                >
                  <a
                    href={`/p/${encodeURIComponent(item.slug)}`}
                    className="block space-y-1 text-sm hover:underline"
                    onClick={() => {
                      void read(item.id);
                      setOpen(false);
                    }}
                  >
                    <span className="block font-medium">{item.title}</span>
                    <span className="block text-muted-foreground">
                      {item.message}
                    </span>
                    <time
                      className="block text-xs text-muted-foreground"
                      dateTime={new Date(item.createdAt).toISOString()}
                    >
                      {formatPublicDate(new Date(item.createdAt))}
                    </time>
                  </a>
                  {!item.read ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="mt-2"
                      onClick={() => void read(item.id)}
                    >
                      Mark read
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-5 text-sm text-muted-foreground">
              Follow a Post to receive updates here.
            </p>
          )}
          {inbox.hasNextPage ? (
            <Button
              variant="outline"
              size="sm"
              className="m-5"
              disabled={inbox.isFetchingNextPage}
              onClick={() => void inbox.fetchNextPage()}
            >
              {inbox.isFetchingNextPage ? "Loading…" : "View more"}
            </Button>
          ) : null}
        </div>
        <div className="space-y-2 border-t p-5">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="notification-email">Email notifications</Label>
            <Switch
              id="notification-email"
              checked={preferences.data?.emailEnabled ?? false}
              disabled={pending || !preferences.data?.emailAvailable}
              onCheckedChange={email}
            />
          </div>
          {preferences.isError ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void preferences.refetch()}
            >
              Retry email preferences
            </Button>
          ) : !preferences.data?.emailAvailable && !preferences.isPending ? (
            <p className="text-xs text-muted-foreground">
              Email requires a verified address from your product account and a
              configured sender.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              You can unsubscribe at any time.
            </p>
          )}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
