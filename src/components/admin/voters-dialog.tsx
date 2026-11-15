import * as React from "react";
import { UsersIcon } from "lucide-react";

import { PaginationBar } from "@/components/portal/pagination-bar";
import { formatDate, plural } from "@/components/portal/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { PostVoter } from "@/contracts/admin";
import type { Page } from "@/contracts/domain";
import { adminPostVoters } from "@/server/functions";

type PostSummary = {
  id: string;
  title: string;
  votes: number;
};

export function VotersDialog({ post, onClose }: { post: PostSummary | null; onClose: () => void }) {
  const last = React.useRef<PostSummary | null>(null);
  if (post) last.current = post;
  const shown = post ?? last.current;

  const [pageNum, setPageNum] = React.useState(1);
  const [data, setData] = React.useState<Page<PostVoter> | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    setPageNum(1);
    setData(null);
    setError(null);
  }, [post?.id]);

  React.useEffect(() => {
    if (!post) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    adminPostVoters({ data: { postId: post.id, page: pageNum } })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setData(res.data);
        else setError(res.error.message);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load voters. Please try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [post, pageNum]);

  return (
    <Dialog open={Boolean(post)} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Voters</DialogTitle>
          <DialogDescription>
            {shown ? `${shown.title} (${plural(data ? data.total : shown.votes, "vote")})` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-80 overflow-y-auto py-1">
          {loading && !data ? (
            <div className="space-y-2 py-2" aria-label="Loading voters">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : error ? (
            <p role="alert" className="py-6 text-center text-sm text-destructive">
              {error}
            </p>
          ) : data && data.items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No voters yet.</p>
          ) : data ? (
            <ul className="divide-y divide-border/70">
              {data.items.map((voter) => (
                <li
                  key={voter.id}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-foreground">{voter.name}</span>
                      {voter.anonymous ? <Badge variant="secondary">Guest</Badge> : null}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {voter.email ?? "Anonymous"}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatDate(voter.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {data && data.total > 0 ? <PaginationBar page={data} onPage={setPageNum} /> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PostVotersButton({ post }: { post: PostSummary }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <div className="mt-3 rounded-lg border bg-card/40 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">Voters</span>
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
            <UsersIcon className="size-3.5" aria-hidden="true" />
            View {plural(post.votes, "voter")}
          </Button>
        </div>
      </div>
      <VotersDialog post={open ? post : null} onClose={() => setOpen(false)} />
    </>
  );
}
