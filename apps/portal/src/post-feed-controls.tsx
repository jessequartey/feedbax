import type { PostStatus, PostType, PublicPostQuery } from "@feedbax/feedback";
import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { postStatuses, postTypes } from "./public-feedback-page";

export function PostFeedControls({
  search,
  onSearchChange,
}: {
  search: PublicPostQuery;
  onSearchChange?: (search: PublicPostQuery) => void;
}) {
  const [query, setQuery] = useState(search.search ?? "");
  const [searchExpanded, setSearchExpanded] = useState(Boolean(search.search));
  const [types, setTypes] = useState<PostType[]>(search.types ?? []);
  const [statuses, setStatuses] = useState<PostStatus[]>(search.statuses ?? []);
  const searchInput = useRef<HTMLInputElement>(null);
  const activeCount =
    (search.types?.length ?? 0) + (search.statuses?.length ?? 0);

  useEffect(() => setQuery(search.search ?? ""), [search.search]);
  useEffect(() => setTypes(search.types ?? []), [search.types]);
  useEffect(() => setStatuses(search.statuses ?? []), [search.statuses]);
  useEffect(() => {
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
    <div className="post-controls">
      <div className="post-search" data-expanded={searchExpanded || undefined}>
        <button
          type="button"
          aria-label={searchExpanded ? "Hide search" : "Show search"}
          aria-expanded={searchExpanded}
          onClick={() => setSearchExpanded((expanded) => !expanded)}
        >
          <Search aria-hidden="true" />
        </button>
        {searchExpanded ? (
          <label>
            <span className="sr-only">Search Posts</span>
            <input
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
      <label>
        <span>Sort</span>
        <select
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
          <option value="trending">Trending</option>
          <option value="top">Top</option>
          <option value="new">New</option>
        </select>
      </label>
      <details className="post-filters">
        <summary>Filters{activeCount ? ` (${activeCount})` : ""}</summary>
        <fieldset>
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
        <fieldset>
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
        <div>
          <button
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
          </button>
          <button
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
          </button>
        </div>
      </details>
    </div>
  );
}
