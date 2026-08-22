import type { PostStatus, PostType, PublicPostQuery } from "@feedbax/feedback";
import { Search } from "lucide-react";
import { Button } from "@feedbax/ui/components/button";
import { Input } from "@feedbax/ui/components/input";
import { Card } from "@feedbax/ui/components/card";
import {
  NativeSelect,
  NativeSelectOption,
} from "@feedbax/ui/components/native-select";
import { useEffect, useRef, useState } from "react";

import { postStatuses, postTypes } from "./public-feedback-page";

export function PostFeedControls({
  search,
  onSearchChange,
  pending = false,
}: {
  search: PublicPostQuery;
  onSearchChange?: (search: PublicPostQuery) => void;
  pending?: boolean;
}) {
  const [query, setQuery] = useState(search.search ?? "");
  const [searchExpanded, setSearchExpanded] = useState(Boolean(search.search));
  const [types, setTypes] = useState<PostType[]>(search.types ?? []);
  const [statuses, setStatuses] = useState<PostStatus[]>(search.statuses ?? []);
  const searchInput = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  const activeCount =
    (search.types?.length ?? 0) + (search.statuses?.length ?? 0);

  useEffect(() => setQuery(search.search ?? ""), [search.search]);
  useEffect(() => setTypes(search.types ?? []), [search.types]);
  useEffect(() => setStatuses(search.statuses ?? []), [search.statuses]);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (searchExpanded) searchInput.current?.focus();
  }, [searchExpanded]);
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      if (query === (search.search ?? "")) return;
      onSearchChange?.({
        ...search,
        cursor: undefined,
        search: query || undefined,
      });
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [onSearchChange, query, search]);

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
      <div
        className={`flex ${searchExpanded ? "flex-1" : ""}`}
        data-expanded={searchExpanded || undefined}
      >
        <Button
          className="h-10 gap-2 px-4 text-sm"
          variant="outline"
          type="button"
          aria-label={searchExpanded ? "Hide search" : "Show search"}
          aria-expanded={searchExpanded}
          onClick={() => setSearchExpanded((expanded) => !expanded)}
        >
          <Search aria-hidden="true" /> Search
        </Button>
        {searchExpanded ? (
          <label>
            <span className="sr-only">Search Posts</span>
            <Input
              className="h-10 text-sm"
              ref={searchInput}
              name="search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Search Posts"
            />
          </label>
        ) : null}
      </div>
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
      <details className="relative">
        <summary className="flex h-10 cursor-pointer list-none items-center border border-input px-4 text-sm text-muted-foreground hover:bg-muted">
          Filters{activeCount ? ` (${activeCount})` : ""}
        </summary>
        <Card className="absolute right-0 z-20 mt-2 w-72 gap-4 p-4">
          <fieldset className="grid gap-2">
            <legend>Post Types</legend>
            {postTypes.map((type) => (
              <label key={type}>
                <input
                  type="checkbox"
                  name="types"
                  value={type}
                  checked={types.includes(type)}
                  onChange={() => toggleType(type)}
                />
                {type}
              </label>
            ))}
          </fieldset>
          <fieldset className="grid gap-2">
            <legend>Post Statuses</legend>
            {postStatuses.map((status) => (
              <label key={status}>
                <input
                  type="checkbox"
                  name="statuses"
                  value={status}
                  checked={statuses.includes(status)}
                  onChange={() => toggleStatus(status)}
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
        </Card>
      </details>
    </div>
  );
}
