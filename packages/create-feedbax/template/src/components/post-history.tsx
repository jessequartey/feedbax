import type { ObservedHistoryPage } from "@feedbax/feedback";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@feedbax/ui/components/button";
import { Skeleton } from "@feedbax/ui/components/skeleton";
import { formatPublicDate } from "../public-date";

export function PostHistory({ slug }: { slug: string }) {
  const client = useQueryClient();
  const clearPublicPost = () => {
    client.setQueryData(["public-post", slug], null);
    client.setQueryData(["public-post-comments", slug], {
      pages: [{ items: [] }],
      pageParams: [undefined],
    });
    void client.invalidateQueries({ queryKey: ["public-post-roadmap"] });
  };
  const query = useInfiniteQuery({
    queryKey: ["public-post-history", slug],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({
        slug,
        ...(pageParam ? { cursor: pageParam } : {}),
      });
      try {
        const response = await fetch(`/internal/post-history?${params}`, {
          cache: "no-store",
        });
        if (!response.ok) throw Error("Progress history is unavailable.");
        const page = (await response.json()) as ObservedHistoryPage;
        if (!page.available) clearPublicPost();
        return page;
      } catch (error) {
        clearPublicPost();
        throw error;
      }
    },
    getNextPageParam: (page) => page.nextCursor,
    staleTime: 0,
    retry: false,
  });
  const events = query.isError
    ? []
    : (query.data?.pages.flatMap((page) => page.items) ?? []);
  return (
    <section className="space-y-3" aria-label="Activities">
      <h2 className="sr-only">Activities</h2>
      {query.isPending ? (
        <Skeleton className="h-12 w-full" />
      ) : query.isError ? (
        <div role="alert" className="space-y-2">
          <p className="text-sm">
            Progress history is temporarily unavailable.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void query.refetch()}
          >
            Retry history
          </Button>
        </div>
      ) : events.length ? (
        <ol className="space-y-4 border-l pl-4">
          {events.map((event) => (
            <li key={event.id} className="space-y-1 text-sm">
              <time
                dateTime={new Date(event.observedAt).toISOString()}
                className="text-xs text-muted-foreground"
              >
                Observed {formatPublicDate(new Date(event.observedAt))}
              </time>
              {event.kind === "status" ? (
                <p>
                  Moved to <span className="font-medium">{event.status}</span>
                </p>
              ) : (
                <>
                  <p className="font-medium">Product Team update</p>
                  <p className="whitespace-pre-wrap">{event.body}</p>
                </>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">No activities yet.</p>
      )}
      {query.hasNextPage && !query.isError ? (
        <Button
          variant="outline"
          size="sm"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? "Loading history…" : "More history"}
        </Button>
      ) : null}
    </section>
  );
}
