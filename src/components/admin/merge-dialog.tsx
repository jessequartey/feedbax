import * as React from "react";
import { CheckIcon, SearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { MergeCandidate, ModerationPost } from "@/contracts/admin";
import { cn } from "@/lib/utils";
import { formatDate, plural } from "@/components/portal/format";
import { adminMergePost, adminSearchMergeTargets } from "@/server/functions";
import { useAdminAction } from "./use-admin";

/** Pick the post this duplicate should be merged into. */
export function MergeDialog({
  post,
  onClose,
}: {
  post: ModerationPost | null;
  onClose: () => void;
}) {
  const act = useAdminAction();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<MergeCandidate[] | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [target, setTarget] = React.useState<MergeCandidate | null>(null);
  const [pending, setPending] = React.useState(false);
  const postId = post?.id;

  React.useEffect(() => {
    setQuery("");
    setTarget(null);
    setResults(null);
    setFailed(false);
  }, [postId]);

  React.useEffect(() => {
    if (!postId) return;
    let current = true;
    const timer = setTimeout(
      () => {
        adminSearchMergeTargets({ data: { excludeId: postId, q: query.trim() } })
          .then((result) => {
            if (!current) return;
            setFailed(!result.ok);
            setResults(result.ok ? result.data : []);
          })
          .catch(() => {
            if (!current) return;
            setFailed(true);
            setResults([]);
          });
      },
      query ? 250 : 0,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [postId, query]);

  async function merge() {
    if (!post || !target) return;
    setPending(true);
    try {
      const done = await act(
        () => adminMergePost({ data: { sourceId: post.id, targetId: target.id } }),
        "Merged. Votes moved to the target.",
      );
      if (done) onClose();
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={post !== null} onOpenChange={(open) => (open || pending ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Merge duplicate</DialogTitle>
          <DialogDescription>
            Choose the post to keep. Votes from “{post?.title}” move to it (one per person), and
            visitors to this post are redirected there.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Search posts to merge into"
            placeholder="Search by title"
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-9 pl-8 max-md:h-11 max-md:text-base"
          />
        </div>
        <div
          role="radiogroup"
          aria-label="Post to keep"
          className="max-h-64 divide-y overflow-y-auto border"
        >
          {results === null ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : failed ? (
            <p className="p-4 text-sm text-destructive">Couldn't load posts. Try again.</p>
          ) : results.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No matching posts.</p>
          ) : (
            results.map((candidate) => {
              const chosen = target?.id === candidate.id;
              return (
                <button
                  key={candidate.id}
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  onClick={() => setTarget(candidate)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm outline-none transition-colors max-md:min-h-11",
                    "hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
                    chosen && "bg-muted",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{candidate.title}</span>
                    <span className="block text-xs text-muted-foreground">
                      {plural(candidate.votes, "vote")} · {formatDate(candidate.createdAt)}
                    </span>
                  </span>
                  {chosen ? <CheckIcon className="size-4 shrink-0" aria-hidden="true" /> : null}
                </button>
              );
            })
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose} className="max-sm:h-11">
            Cancel
          </Button>
          <Button
            disabled={!target || pending}
            onClick={() => void merge()}
            className="max-sm:h-11"
          >
            {pending ? "Merging…" : "Merge into selected"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
