import * as React from "react";
import { SearchIcon } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const CommandPalette = React.lazy(() => import("./command-palette"));

// One palette per page: the open state lives here so any search box can open it.
let isOpen = false;
let opener: HTMLElement | null = null;
const listeners = new Set<() => void>();

function setOpen(next: boolean, from?: HTMLElement | null) {
  if (next === isOpen) return;
  isOpen = next;
  if (next) {
    const active = document.activeElement;
    opener = from ?? (active instanceof HTMLElement && active !== document.body ? active : null);
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

const subscribeNever = () => () => {};
const isMacClient = () => {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return /Mac|iPhone|iPad/i.test(nav.userAgentData?.platform || navigator.platform || "");
};

/** The portal's one listener and dialog. It renders no button; use `CommandSearchTrigger`. */
export function CommandSearch() {
  const open = React.useSyncExternalStore(
    subscribe,
    () => isOpen,
    () => false,
  );

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (!event.repeat) setOpen(!isOpen);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const wasOpen = React.useRef(false);
  React.useEffect(() => {
    if (open) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    const target = opener;
    opener = null;
    // After the dialog's own focus handling, put focus back on whatever opened it.
    const frame = requestAnimationFrame(() => {
      if (target?.isConnected && document.activeElement !== target) target.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => setOpen(next)}>
      {open ? (
        <React.Suspense
          fallback={
            <DialogContent>
              <DialogTitle>Search feedback and changelog</DialogTitle>
              <p
                role="status"
                className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"
              >
                <Spinner aria-hidden="true" />
                <span>Loading search…</span>
              </p>
            </DialogContent>
          }
        >
          <CommandPalette onClose={() => setOpen(false)} />
        </React.Suspense>
      ) : null}
    </Dialog>
  );
}

/** A search box that looks like an input but opens the command palette. */
export function CommandSearchTrigger({ className }: { className?: string }) {
  const mac = React.useSyncExternalStore(subscribeNever, isMacClient, () => false);
  return (
    <button
      type="button"
      aria-label="Search feedback and changelog"
      aria-haspopup="dialog"
      aria-keyshortcuts="Meta+K Control+K"
      onClick={(event) => setOpen(true, event.currentTarget)}
      className={cn(
        "relative flex h-9 w-full min-w-0 items-center rounded-none border border-input bg-transparent pr-2 pl-8 text-left text-xs text-muted-foreground transition-colors outline-none hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 max-md:h-11 max-md:min-h-11 max-md:text-base dark:bg-input/30",
        className,
      )}
    >
      <SearchIcon
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
        aria-hidden="true"
      />
      <span className="flex-1 truncate">Search</span>
      <Kbd aria-hidden="true" className="max-md:hidden">
        {mac ? "⌘K" : "Ctrl K"}
      </Kbd>
    </button>
  );
}
