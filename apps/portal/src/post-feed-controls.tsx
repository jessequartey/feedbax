import type { PostStatus, PostType, PublicPostQuery } from "@feedbax/feedback";
import { Button } from "@feedbax/ui/components/button";
import { Card } from "@feedbax/ui/components/card";
import { Tabs, TabsList, TabsTrigger } from "@feedbax/ui/components/tabs";
import {
  Bug,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  Lightbulb,
  List,
  MessageCircle,
} from "lucide-react";
import type { ComponentType } from "react";

import { CommandPaletteTrigger } from "./components/command-palette";

type SearchChange = (search: PublicPostQuery) => void;

const boards = [
  { label: "All posts", type: undefined, icon: List },
  { label: "Feature requests", type: "Feature Request", icon: Lightbulb },
  { label: "Bug reports", type: "Bug Report", icon: Bug },
  { label: "General feedback", type: "General Feedback", icon: MessageCircle },
] as const satisfies readonly {
  label: string;
  type: PostType | undefined;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}[];

const roadmapStatuses = [
  { label: "Planned", status: "Planned", icon: CalendarDays },
  { label: "In progress", status: "In Progress", icon: CircleDot },
  { label: "Shipped", status: "Shipped", icon: CheckCircle2 },
] as const satisfies readonly {
  label: string;
  status: PostStatus;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}[];

export function PostFeedControls({
  search,
  onSearchChange,
  pending = false,
}: {
  search: PublicPostQuery;
  onSearchChange?: SearchChange;
  pending?: boolean;
}) {
  return (
    <div
      className="flex min-w-0 flex-1 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
      role="group"
      aria-label="Post feed controls"
      aria-busy={pending || undefined}
    >
      {pending ? <span className="sr-only">Updating Posts…</span> : null}
      <Tabs
        value={search.sort ?? "trending"}
        onValueChange={(sort) =>
          onSearchChange?.({
            ...search,
            cursor: undefined,
            sort: sort as PublicPostQuery["sort"],
          })
        }
      >
        <TabsList
          aria-label="Sort Posts"
          className="grid h-10 w-full grid-cols-3 p-0 lg:w-72"
        >
          <TabsTrigger className="px-5 text-sm" value="trending">
            Trending
          </TabsTrigger>
          <TabsTrigger className="px-5 text-sm" value="top">
            Top
          </TabsTrigger>
          <TabsTrigger className="px-5 text-sm" value="new">
            New
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <CommandPaletteTrigger className="justify-start lg:justify-center" />
    </div>
  );
}

export function BoardNavigation({
  search,
  onSearchChange,
}: {
  search: PublicPostQuery;
  onSearchChange?: SearchChange;
}) {
  const activeType = search.types?.length === 1 ? search.types[0] : undefined;
  const hasNoType = !search.types?.length;

  return (
    <nav aria-labelledby="boards-heading">
      <h2 id="boards-heading" className="mb-3 text-sm font-medium">
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
                  types: !type || active ? [] : [type],
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
}: {
  search: PublicPostQuery;
  onSearchChange?: SearchChange;
}) {
  const selected = search.statuses ?? [];

  return (
    <section aria-labelledby="status-filters-heading">
      <h2 id="status-filters-heading" className="mb-3 text-sm font-medium">
        Status
      </h2>
      <Card
        className="gap-0 overflow-hidden py-0"
        role="group"
        aria-label="Status filters"
      >
        {roadmapStatuses.map(({ label, status, icon: Icon }) => {
          const active = selected.includes(status);
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
                  statuses: active
                    ? selected.filter((candidate) => candidate !== status)
                    : [...selected, status],
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
