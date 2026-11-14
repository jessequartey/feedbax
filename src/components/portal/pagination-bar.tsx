import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Page } from "@/contracts/domain";

export function PaginationBar({
  page,
  onPage,
}: {
  page: Pick<Page<unknown>, "page" | "limit" | "total" | "hasMore">;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(page.total / page.limit));
  const from = (page.page - 1) * page.limit + 1;
  const to = Math.min(page.total, page.page * page.limit);
  return (
    <nav
      aria-label="Pagination"
      className="mt-4 flex items-center justify-between gap-3 text-sm text-muted-foreground"
    >
      <p aria-live="polite">
        {page.total === 0
          ? "No results"
          : `Showing ${from}–${to} of ${page.total.toLocaleString("en-US")}`}
      </p>
      {pages > 1 ? (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="max-md:h-11"
            disabled={page.page <= 1}
            onClick={() => onPage(page.page - 1)}
          >
            <ChevronLeftIcon aria-hidden="true" /> Previous
          </Button>
          <span className="hidden tabular-nums sm:inline">
            Page {page.page} of {pages}
          </span>
          <Button
            variant="outline"
            className="max-md:h-11"
            disabled={!page.hasMore}
            onClick={() => onPage(page.page + 1)}
          >
            Next <ChevronRightIcon aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </nav>
  );
}
