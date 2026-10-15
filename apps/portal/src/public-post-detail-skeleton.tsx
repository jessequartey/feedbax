import { Skeleton } from "@feedbax/ui/components/skeleton";

export function PublicPostDetailSkeleton({
  display = "page",
}: { display?: "overlay" | "page" } = {}) {
  return (
    <main
      className="feedback-detail public-post-detail"
      data-display={display}
      aria-label="Loading Post details"
      aria-busy="true"
    >
      {display === "page" ? (
        <Skeleton aria-hidden="true" className="h-4 w-32" />
      ) : null}
      <div aria-hidden="true" className="post-detail-layout">
        <div className="post-detail-primary space-y-7">
          <div className="flex gap-2">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-5 w-24" />
          </div>
          <div className="space-y-3">
            <Skeleton
              className={display === "overlay" ? "h-5 w-4/5" : "h-7 w-4/5"}
            />
            <Skeleton
              className={display === "overlay" ? "h-5 w-3/5" : "h-7 w-3/5"}
            />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <Skeleton className="h-10 w-16" />
          <div className="space-y-5 border-t pt-6">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
        <div className="post-detail-sidebar space-y-7">
          <Skeleton className="h-4 w-20" />
          {[0, 1, 2, 3].map((row) => (
            <div className="flex justify-between gap-4" key={row}>
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">Loading Post details…</span>
    </main>
  );
}
