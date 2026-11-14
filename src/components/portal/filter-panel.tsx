import * as React from "react";
import { FilterIcon, ListIcon, SearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  CATEGORY_LABELS,
  STATUS_LABELS,
  type Category,
  type Sort,
  type Status,
} from "@/contracts/domain";
import { cn } from "@/lib/utils";
import { CATEGORY_ICONS, STATUS_ICONS } from "./post-badges";
import { CATEGORY_VALUES, SORT_VALUES, STATUS_VALUES, MAX_QUERY_LENGTH } from "./portal-search";

const SORT_LABELS: Record<Sort, string> = { trending: "Trending", top: "Top", new: "New" };

export function SortControl({ value, onChange }: { value: Sort; onChange: (sort: Sort) => void }) {
  return (
    <ToggleGroup
      aria-label="Sort posts"
      variant="outline"
      spacing={0}
      value={[value]}
      onValueChange={(next) => {
        // A toggle group can be emptied by clicking the active item. A sort is always required.
        const chosen = next[0] as Sort | undefined;
        if (chosen) onChange(chosen);
      }}
      className="w-full md:w-fit"
    >
      {SORT_VALUES.map((sort) => (
        <ToggleGroupItem
          key={sort}
          value={sort}
          className="h-9 flex-1 px-4 max-md:h-11 md:flex-none"
        >
          {SORT_LABELS[sort]}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

function FilterOption({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm outline-none transition-colors max-md:min-h-11",
        "hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset",
        active ? "bg-muted font-medium text-foreground" : "text-muted-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {children}
    </button>
  );
}

export type FilterPanelProps = {
  category?: Category;
  status?: Status;
  onCategory: (category: Category | undefined) => void;
  onStatus?: (status: Status | undefined) => void;
};

/** The category and status lists. Used as the 280 px sidebar and inside the mobile Sheet. */
export function FilterPanel({ category, status, onCategory, onStatus }: FilterPanelProps) {
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="filter-category">
        <h2 id="filter-category" className="mb-3 text-sm font-medium">
          Categories
        </h2>
        <div className="divide-y border">
          <FilterOption active={!category} icon={ListIcon} onClick={() => onCategory(undefined)}>
            All posts
          </FilterOption>
          {CATEGORY_VALUES.map((value) => (
            <FilterOption
              key={value}
              active={category === value}
              icon={CATEGORY_ICONS[value]}
              onClick={() => onCategory(category === value ? undefined : value)}
            >
              {CATEGORY_LABELS[value]}
            </FilterOption>
          ))}
        </div>
      </section>
      {onStatus ? (
        <section aria-labelledby="filter-status">
          <h2 id="filter-status" className="mb-3 text-sm font-medium">
            Status
          </h2>
          <div className="divide-y border">
            <FilterOption active={!status} icon={ListIcon} onClick={() => onStatus(undefined)}>
              Any status
            </FilterOption>
            {STATUS_VALUES.map((value) => (
              <FilterOption
                key={value}
                active={status === value}
                icon={STATUS_ICONS[value]}
                onClick={() => onStatus(status === value ? undefined : value)}
              >
                {STATUS_LABELS[value]}
              </FilterOption>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** The "Filters" button. On the board it only shows below `lg`, where the sidebar is hidden. */
export function FiltersSheet({
  activeCount,
  className,
  ...panel
}: FilterPanelProps & { activeCount: number; className?: string }) {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button variant="outline" className={cn("h-9 max-md:h-11", className)}>
            <FilterIcon aria-hidden="true" />
            Filters
            {activeCount > 0 ? (
              <span className="ml-0.5 bg-primary px-1.5 text-[0.6875rem] leading-4 text-primary-foreground">
                {activeCount}
                <span className="sr-only"> active</span>
              </span>
            ) : null}
          </Button>
        }
      />
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Narrow the posts you see.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          <FilterPanel {...panel} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Search box. URL updates are debounced and never fight what the person is typing. */
export function SearchField({
  value,
  onCommit,
  className,
  label = "Search posts",
}: {
  value: string | undefined;
  onCommit: (query: string | undefined) => void;
  className?: string;
  label?: string;
}) {
  const [text, setText] = React.useState(value ?? "");
  const committed = React.useRef(value ?? "");

  React.useEffect(() => {
    // The URL changed from outside (back button, "Clear filters"): follow it.
    if ((value ?? "") !== committed.current) {
      committed.current = value ?? "";
      setText(value ?? "");
    }
  }, [value]);

  const commit = React.useCallback(
    (next: string) => {
      const trimmed = next.trim();
      if (trimmed === committed.current) return;
      committed.current = trimmed;
      onCommit(trimmed || undefined);
    },
    [onCommit],
  );

  React.useEffect(() => {
    const timer = setTimeout(() => commit(text), 350);
    return () => clearTimeout(timer);
  }, [text, commit]);

  return (
    <form
      role="search"
      className={cn("relative", className)}
      onSubmit={(event) => {
        event.preventDefault();
        commit(text);
      }}
    >
      <SearchIcon
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        type="search"
        name="q"
        aria-label={label}
        placeholder="Search"
        autoComplete="off"
        maxLength={MAX_QUERY_LENGTH}
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="h-9 pl-8 max-md:h-11 max-md:text-base"
      />
    </form>
  );
}
