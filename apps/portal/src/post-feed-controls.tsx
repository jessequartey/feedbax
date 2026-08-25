import type { PostStatus, PostType, PublicPostQuery } from "@feedbax/feedback";
import { Button } from "@feedbax/ui/components/button";
import { Checkbox } from "@feedbax/ui/components/checkbox";
import {
  NativeSelect,
  NativeSelectOption,
} from "@feedbax/ui/components/native-select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@feedbax/ui/components/popover";
import { useEffect, useState } from "react";

import { postStatuses, postTypes } from "./public-feedback-page";
import { CommandPaletteTrigger } from "./components/command-palette";

export function PostFeedControls({
  search,
  onSearchChange,
  pending = false,
}: {
  search: PublicPostQuery;
  onSearchChange?: (search: PublicPostQuery) => void;
  pending?: boolean;
}) {
  const [types, setTypes] = useState<PostType[]>(search.types ?? []);
  const [statuses, setStatuses] = useState<PostStatus[]>(search.statuses ?? []);
  const activeCount =
    (search.types?.length ?? 0) + (search.statuses?.length ?? 0);

  useEffect(() => setTypes(search.types ?? []), [search.types]);
  useEffect(() => setStatuses(search.statuses ?? []), [search.statuses]);

  function toggleType(type: PostType) {
    setTypes((current) =>
      current.includes(type)
        ? current.filter((candidate) => candidate !== type)
        : [...current, type],
    );
  }

  function toggleStatus(status: PostStatus) {
    setStatuses((current) =>
      current.includes(status)
        ? current.filter((candidate) => candidate !== status)
        : [...current, status],
    );
  }

  return (
    <div
      className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-end"
      role="group"
      aria-label="Post feed controls"
      aria-busy={pending || undefined}
    >
      {pending ? <span className="sr-only">Updating Posts…</span> : null}
      <CommandPaletteTrigger />
      <label className="order-first sm:mr-auto">
        <span className="sr-only">Sort</span>
        <NativeSelect
          className="min-w-48 [&_select]:h-10 [&_select]:text-sm"
          name="sort"
          value={search.sort ?? "trending"}
          onChange={(event) =>
            onSearchChange?.({
              ...search,
              cursor: undefined,
              sort: event.currentTarget.value as PublicPostQuery["sort"],
            })
          }
        >
          <NativeSelectOption value="trending">Trending</NativeSelectOption>
          <NativeSelectOption value="top">Top</NativeSelectOption>
          <NativeSelectOption value="new">New</NativeSelectOption>
        </NativeSelect>
      </label>
      <Popover>
        <PopoverTrigger render={<Button type="button" variant="outline" />}>
          Filters{activeCount ? ` (${activeCount})` : ""}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 gap-4 p-4">
          <fieldset className="grid gap-2">
            <legend>Post Types</legend>
            {postTypes.map((type) => (
              <label className="flex items-center gap-2" key={type}>
                <Checkbox
                  name="types"
                  value={type}
                  checked={types.includes(type)}
                  onCheckedChange={() => toggleType(type)}
                />
                {type}
              </label>
            ))}
          </fieldset>
          <fieldset className="grid gap-2">
            <legend>Post Statuses</legend>
            {postStatuses.map((status) => (
              <label className="flex items-center gap-2" key={status}>
                <Checkbox
                  name="statuses"
                  value={status}
                  checked={statuses.includes(status)}
                  onCheckedChange={() => toggleStatus(status)}
                />
                {status}
              </label>
            ))}
          </fieldset>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                setTypes([]);
                setStatuses([]);
                onSearchChange?.({
                  ...search,
                  cursor: undefined,
                  types: [],
                  statuses: [],
                });
              }}
            >
              Clear All
            </Button>
            <Button
              type="button"
              onClick={() =>
                onSearchChange?.({
                  ...search,
                  cursor: undefined,
                  types,
                  statuses,
                })
              }
            >
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
