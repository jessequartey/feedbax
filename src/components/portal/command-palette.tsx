import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { FileTextIcon, MessageSquareIcon } from "lucide-react";
import type { PortalSearchResults } from "@/contracts/search";
import { SEARCH_QUERY_LIMIT } from "@/contracts/search";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function CommandPalette({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = React.useState("");
  const [attempt, setAttempt] = React.useState(0);
  const [result, setResult] = React.useState<{
    query: string;
    data?: PortalSearchResults;
    error?: boolean;
  } | null>(null);
  const trimmed = query.trim();
  const current = result?.query === trimmed ? result : null;
  const loading = !current;

  React.useEffect(() => {
    const controller = new AbortController();
    // Empty search opens immediately with top posts; typed queries wait for a pause.
    const timeout = window.setTimeout(
      async () => {
        try {
          const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
            signal: controller.signal,
            credentials: "omit",
          });
          if (!response.ok) throw new Error("Search unavailable");
          const data = (await response.json()) as PortalSearchResults;
          if (!controller.signal.aborted) setResult({ query: trimmed, data });
        } catch {
          if (!controller.signal.aborted) setResult({ query: trimmed, error: true });
        }
      },
      trimmed ? 150 : 0,
    );
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [trimmed, attempt]);

  function select(kind: "feedback" | "changelog", id: string) {
    onClose();
    void navigate(
      kind === "feedback"
        ? { to: "/posts/$postId", params: { postId: id } }
        : { to: "/changelog/$entryId", params: { entryId: id } },
    );
  }

  return (
    <DialogContent
      className="top-[12dvh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl"
      showCloseButton={false}
    >
      <DialogTitle className="sr-only">Search feedback and changelog</DialogTitle>
      <DialogDescription className="sr-only">
        Type to search. Use the arrow keys to choose a result, Enter to open it, and Escape to
        close.
      </DialogDescription>
      <Command shouldFilter={false} loop>
        <CommandInput
          autoFocus
          aria-label="Search feedback and changelog"
          placeholder="Search feedback and changelog…"
          value={query}
          onValueChange={setQuery}
          maxLength={SEARCH_QUERY_LIMIT}
          className="h-12 px-2 text-base md:text-sm"
        />
        <CommandList aria-busy={loading} className="max-h-[min(55dvh,420px)] p-2">
          {loading ? (
            <p role="status" className="px-3 py-8 text-center text-sm text-muted-foreground">
              Searching…
            </p>
          ) : null}
          {current?.error ? (
            <div role="alert" className="space-y-3 px-3 py-6 text-center text-sm">
              <p>Search is unavailable. Please try again.</p>
              <Button
                variant="outline"
                onClick={() => {
                  setResult(null);
                  setAttempt((value) => value + 1);
                }}
              >
                Try again
              </Button>
            </div>
          ) : null}
          {current?.data ? (
            <>
              <CommandEmpty className="text-sm">
                {trimmed
                  ? "No results found. Try another word."
                  : "No feedback or changelog entries yet."}
              </CommandEmpty>
              {current.data.feedback.length ? (
                <CommandGroup heading={trimmed ? "Feedback" : "Feedback · Top posts"}>
                  {current.data.feedback.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={`feedback:${item.id}`}
                      onSelect={() => select("feedback", item.id)}
                      className="min-h-14 gap-3 px-3 py-3 text-sm"
                    >
                      <MessageSquareIcon aria-hidden="true" className="text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{item.title}</span>
                        {item.excerpt ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {item.excerpt}
                          </span>
                        ) : null}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
              {current.data.feedback.length && current.data.changelog.length ? (
                <CommandSeparator className="my-2" />
              ) : null}
              {current.data.changelog.length ? (
                <CommandGroup heading="Changelog">
                  {current.data.changelog.map((item) => (
                    <CommandItem
                      key={item.id}
                      value={`changelog:${item.id}`}
                      onSelect={() => select("changelog", item.id)}
                      className="min-h-14 gap-3 px-3 py-3 text-sm"
                    >
                      <FileTextIcon aria-hidden="true" className="text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{item.title}</span>
                        {item.excerpt ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {item.excerpt}
                          </span>
                        ) : null}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </>
          ) : null}
        </CommandList>
      </Command>
      <div className="flex items-center justify-between border-t px-4 py-2 text-xs text-muted-foreground">
        <span>↑ ↓ Navigate · Enter Open</span>
        <Button variant="ghost" size="sm" onClick={onClose} className="h-8 text-xs">
          Esc · Close
        </Button>
      </div>
    </DialogContent>
  );
}
