import { Skeleton } from "@feedbax/ui/components/skeleton";

export default function Loader({
  label = "Loading content",
}: { label?: string } = {}) {
  return (
    <div
      className="portal-loading"
      role="status"
      aria-label={label}
      aria-busy="true"
    >
      <span className="sr-only">{label}…</span>
      <div
        aria-hidden="true"
        className="mx-auto grid w-full max-w-7xl gap-10 px-6 py-10 md:grid-cols-[1fr_16rem] md:px-10"
      >
        <div className="space-y-8">
          <div className="space-y-3">
            <Skeleton className="h-8 w-40" />
            <Skeleton className="h-4 w-64 max-w-full" />
          </div>
          <div className="flex gap-3">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-24" />
          </div>
          <div className="divide-y border-y">
            {[0, 1, 2].map((row) => (
              <div
                key={row}
                data-post-skeleton-row
                className="flex items-start gap-5 py-7"
              >
                <Skeleton className="size-10 shrink-0" />
                <div className="flex-1 space-y-3">
                  <Skeleton className="h-4 w-3/5" />
                  <Skeleton className="h-3 w-4/5" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="hidden space-y-6 pt-3 md:block">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-28 w-full" />
        </div>
      </div>
    </div>
  );
}
