import type { PostStatus, PostType, PublicPostQuery } from "@feedbax/feedback";
import { Button } from "@feedbax/ui/components/button";
import { ButtonGroup } from "@feedbax/ui/components/button-group";
import { Card } from "@feedbax/ui/components/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@feedbax/ui/components/sheet";
import { List, ListFilter } from "lucide-react";
import { type ComponentType } from "react";

import { CommandPaletteTrigger } from "./components/command-palette";
import { CreatePostTrigger } from "./components/create-post-trigger";
import { postStatuses, postTypes } from "./public-feedback-page";
import {
  postStatusPresentation,
  postTypePresentation,
} from "./post-presentation";
import { useMediaQuery } from "./use-media-query";

type SearchChange = (search: PublicPostQuery) => void;

const boards = [
  { label: "All posts", type: undefined, icon: List },
  ...postTypes.map((type) => ({
    label: postTypePresentation[type].boardLabel,
    type,
    icon: postTypePresentation[type].Icon,
  })),
] as const satisfies readonly {
  label: string;
  type: PostType | undefined;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}[];

const roadmapStatuses = [
  "Planned",
  "In Progress",
  "Shipped",
] as const satisfies readonly PostStatus[];

const sortOptions = [
  { label: "Trending", value: "trending" },
  { label: "Top", value: "top" },
  { label: "New", value: "new" },
] as const satisfies readonly {
  label: string;
  value: NonNullable<PublicPostQuery["sort"]>;
}[];

const mobileMediaQuery = "(max-width: 1023px)";

export function PostFeedControls({
  search,
  onSearchChange,
  pending = false,
  contextualCreatePost = false,
}: {
  search: PublicPostQuery;
  onSearchChange?: SearchChange;
  pending?: boolean;
  contextualCreatePost?: boolean;
}) {
  const mobile = useMediaQuery(mobileMediaQuery);
  const newPost = (
    <CreatePostTrigger
      className={
        mobile
          ? "order-2 h-12 w-full px-5 text-sm"
          : "order-3 h-10 w-auto px-5 text-sm"
      }
      contextual={contextualCreatePost}
    />
  );

  return (
    <div
      className="flex min-w-0 flex-1 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
      role="group"
      aria-label="Post feed controls"
      aria-busy={pending || undefined}
    >
      {pending ? <span className="sr-only">Updating Posts…</span> : null}
      <ButtonGroup
        aria-label="Sort Posts"
        className={
          mobile
            ? "order-1 grid h-12 w-full grid-cols-3"
            : "order-1 grid h-10 w-72 grid-cols-3"
        }
      >
        {sortOptions.map(({ label, value }) => (
          <Button
            key={value}
            type="button"
            variant="outline"
            aria-pressed={(search.sort ?? "trending") === value}
            className={`${mobile ? "h-12" : "h-10"} px-5 text-sm aria-pressed:bg-muted aria-pressed:text-foreground`}
            onClick={() =>
              onSearchChange?.({
                ...search,
                cursor: undefined,
                sort: value,
              })
            }
          >
            {label}
          </Button>
        ))}
      </ButtonGroup>
      {mobile ? (
        <>
          {newPost}
          <div className="order-3 grid grid-cols-[minmax(0,1fr)_auto] gap-3">
            <CommandPaletteTrigger className="h-12 w-full justify-start" />
            <MobilePostFilters
              search={search}
              onSearchChange={onSearchChange}
            />
          </div>
        </>
      ) : (
        <>
          <CommandPaletteTrigger className="order-2 ml-auto justify-center" />
          {newPost}
        </>
      )}
    </div>
  );
}

export function BoardNavigation({
  search,
  onSearchChange,
  headingId = "boards-heading",
  ariaLabel,
}: {
  search: PublicPostQuery;
  onSearchChange?: SearchChange;
  headingId?: string;
  ariaLabel?: string;
}) {
  const activeType = search.types?.length === 1 ? search.types[0] : undefined;
  const hasNoType = !search.types?.length;

  return (
    <nav
      aria-labelledby={ariaLabel ? undefined : headingId}
      aria-label={ariaLabel}
    >
      <h2 id={headingId} className="mb-3 text-sm font-medium">
        Boards
      </h2>
      <Card className="gap-0 overflow-hidden py-0">
        {boards.map(({ label, type, icon: Icon }) => {
          const active = type ? activeType === type : hasNoType;
          return (
            <Button
              key={label}
              type="button"
              variant="ghost"
              aria-pressed={active}
              className="h-12 w-full justify-start gap-3 border-b px-4 text-sm text-muted-foreground last:border-b-0 aria-pressed:bg-muted aria-pressed:text-foreground"
              onClick={() =>
                onSearchChange?.({
                  ...search,
                  cursor: undefined,
                  types: !type || active ? undefined : [type],
                })
              }
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </Button>
          );
        })}
      </Card>
    </nav>
  );
}

export function StatusNavigation({
  search,
  onSearchChange,
  headingId = "status-filters-heading",
  ariaLabel = "Status filters",
  statuses = roadmapStatuses,
}: {
  search: PublicPostQuery;
  onSearchChange?: SearchChange;
  headingId?: string;
  ariaLabel?: string;
  statuses?: readonly PostStatus[];
}) {
  const selected = search.statuses ?? [];

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="mb-3 text-sm font-medium">
        Status
      </h2>
      <Card
        className="gap-0 overflow-hidden py-0"
        role="group"
        aria-label={ariaLabel}
      >
        {statuses.map((status) => {
          const { Icon, label } = postStatusPresentation[status];
          const active = selected.includes(status);
          const nextStatuses = active
            ? selected.filter((candidate) => candidate !== status)
            : [...selected, status];
          return (
            <Button
              key={status}
              type="button"
              variant="ghost"
              aria-pressed={active}
              className="h-12 w-full justify-start gap-3 border-b px-4 text-sm text-muted-foreground last:border-b-0 aria-pressed:bg-muted aria-pressed:text-foreground"
              onClick={() =>
                onSearchChange?.({
                  ...search,
                  cursor: undefined,
                  statuses: nextStatuses.length ? nextStatuses : undefined,
                })
              }
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </Button>
          );
        })}
      </Card>
    </section>
  );
}

export function MobilePostFilters({
  search,
  onSearchChange,
}: {
  search: PublicPostQuery;
  onSearchChange?: SearchChange;
}) {
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            className="h-12 gap-2 px-4 text-sm lg:hidden"
            type="button"
            variant="outline"
          />
        }
      >
        <ListFilter aria-hidden="true" />
        Filters
      </SheetTrigger>
      <SheetContent
        className="w-[min(100%,24rem)] overflow-y-auto lg:hidden"
        side="right"
      >
        <SheetHeader className="border-b p-6 pr-14">
          <SheetTitle className="text-lg">Filter Posts</SheetTitle>
          <SheetDescription>
            Choose a Board and combine any Post Statuses.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-8 p-6">
          <BoardNavigation
            search={search}
            onSearchChange={onSearchChange}
            headingId="mobile-boards-heading"
            ariaLabel="Mobile Boards"
          />
          <StatusNavigation
            search={search}
            onSearchChange={onSearchChange}
            headingId="mobile-status-filters-heading"
            ariaLabel="Mobile Status filters"
            statuses={postStatuses}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
