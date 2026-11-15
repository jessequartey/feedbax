import * as React from "react";
import { SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const CommandPalette = React.lazy(() => import("./command-palette"));

/** One portal-wide listener; load cmdk and fetch results only when search is opened. */
export function CommandSearch() {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (!event.repeat) setOpen((value) => !value);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            aria-label="Search feedback and changelog"
            aria-keyshortcuts="Meta+K Control+K"
            className="size-11 px-0 md:h-9 md:w-auto md:gap-2 md:px-3"
          />
        }
      >
        <SearchIcon aria-hidden="true" />
        <span className="hidden md:inline">Search</span>
        <kbd className="hidden text-xs text-muted-foreground lg:inline">⌘ / Ctrl K</kbd>
      </DialogTrigger>
      {open ? (
        <React.Suspense
          fallback={
            <DialogContent>
              <DialogTitle>Search feedback and changelog</DialogTitle>
              <p role="status">Loading search…</p>
            </DialogContent>
          }
        >
          <CommandPalette onClose={() => setOpen(false)} />
        </React.Suspense>
      ) : null}
    </Dialog>
  );
}
