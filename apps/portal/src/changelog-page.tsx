import { Badge } from "@feedbax/ui/components/badge";
import { Button } from "@feedbax/ui/components/button";
import { ButtonGroup } from "@feedbax/ui/components/button-group";
import { cn } from "@feedbax/ui/lib/utils";
import { useRouterState } from "@tanstack/react-router";
import { ChevronDown, Link2 } from "lucide-react";
import { useEffect, useState } from "react";

import {
  changelogEntries,
  type ChangelogBodyBlock,
  type ChangelogDate,
  type ChangelogLabel,
} from "./changelog-content";
import { CommandPaletteTrigger } from "./components/command-palette";

const initialVisibleEntries = 4;

const changelogFilters = [
  { label: "All", value: undefined },
  { label: "New features", value: "New feature" },
  { label: "Improvements", value: "Improved" },
  { label: "Fixes", value: "Fixed" },
] as const satisfies readonly {
  label: string;
  value: ChangelogLabel | undefined;
}[];

const orderedChangelogEntries = [...changelogEntries].sort((left, right) =>
  compareChangelogDates(left.date, right.date),
);

export function ChangelogPage() {
  const locationHash = useRouterState({
    select: (state) => state.location.hash,
  });
  const [selectedLabel, setSelectedLabel] = useState<
    ChangelogLabel | undefined
  >();
  const requestedVisibleCount = visibleEntryCountForHash(locationHash);
  const [visibleCount, setVisibleCount] = useState(requestedVisibleCount);
  const filteredEntries = selectedLabel
    ? orderedChangelogEntries.filter((entry) =>
        entry.labels.includes(selectedLabel),
      )
    : orderedChangelogEntries;
  const visibleEntries = filteredEntries.slice(0, visibleCount);

  useEffect(() => {
    setVisibleCount((current) => Math.max(current, requestedVisibleCount));
  }, [requestedVisibleCount]);

  useEffect(() => {
    const slug = changelogSlugFromHash(locationHash);
    if (!slug) return;
    document.getElementById(slug)?.scrollIntoView?.({ block: "start" });
  }, [locationHash, visibleCount]);

  return (
    <main className="changelog-page">
      <header className="changelog-heading">
        <div>
          <h1>Changelog</h1>
          <p>Product updates, fixes, and improvements.</p>
        </div>
      </header>

      <div className="changelog-toolbar">
        <ButtonGroup className="changelog-filters" aria-label="Filter updates">
          {changelogFilters.map((filter) => (
            <Button
              className="h-11 md:h-8"
              key={filter.label}
              type="button"
              variant="outline"
              aria-pressed={selectedLabel === filter.value}
              onClick={() => {
                setSelectedLabel(filter.value);
                setVisibleCount(initialVisibleEntries);
              }}
            >
              {filter.label}
            </Button>
          ))}
        </ButtonGroup>
        <CommandPaletteTrigger className="h-11 md:h-10" />
      </div>

      <ol className="changelog-timeline" aria-label="Product updates">
        {visibleEntries.map((entry) => (
          <li className="changelog-timeline-entry" key={entry.slug}>
            <time dateTime={entry.date}>{formatDate(entry.date)}</time>
            <span className="changelog-timeline-marker" aria-hidden="true" />
            <article id={entry.slug} tabIndex={-1}>
              <div
                className={cn(
                  "changelog-entry-layout",
                  entry.image && "has-image",
                )}
              >
                <div className="changelog-entry-copy">
                  <div className="changelog-labels" aria-label="Labels">
                    {entry.labels.map((label) => (
                      <ChangelogLabel key={label} label={label} />
                    ))}
                  </div>
                  <div className="changelog-entry-title">
                    <h2>{entry.title}</h2>
                    <a
                      href={`#${entry.slug}`}
                      aria-label={`Link to ${entry.title}`}
                    >
                      <Link2 aria-hidden="true" />
                    </a>
                  </div>
                  <p className="changelog-entry-summary">{entry.summary}</p>
                  <div className="changelog-entry-body">
                    {entry.body.map((block, index) => (
                      <ChangelogBody
                        block={block}
                        key={`${entry.slug}-${index}`}
                      />
                    ))}
                  </div>
                </div>
                {entry.image ? (
                  <img
                    src={entry.image.src}
                    alt={entry.image.alt}
                    width={760}
                    height={420}
                  />
                ) : null}
              </div>
            </article>
          </li>
        ))}
      </ol>
      {visibleCount < filteredEntries.length ? (
        <div className="changelog-load-more">
          <Button
            className="h-11 min-w-64 gap-2 text-sm md:h-10"
            type="button"
            variant="outline"
            onClick={() => setVisibleCount(filteredEntries.length)}
          >
            Load more updates
            <ChevronDown aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </main>
  );
}

function ChangelogLabel({ label }: { label: ChangelogLabel }) {
  const tone = label.toLowerCase();
  return (
    <Badge
      className={cn(
        "changelog-label",
        tone === "new feature" && "is-new",
        tone === "improved" && "is-improved",
        tone === "fixed" && "is-fixed",
      )}
      variant="outline"
    >
      <span aria-hidden="true" />
      {label}
    </Badge>
  );
}

function ChangelogBody({ block }: { block: ChangelogBodyBlock }) {
  if (block.type === "bullets") {
    return (
      <ul>
        {block.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }
  return <p>{block.text}</p>;
}

function compareChangelogDates(left: ChangelogDate, right: ChangelogDate) {
  return (
    changelogDateValue(right).getTime() - changelogDateValue(left).getTime()
  );
}

function visibleEntryCountForHash(hash: string) {
  const slug = changelogSlugFromHash(hash);
  const requestedIndex = orderedChangelogEntries.findIndex(
    (entry) => entry.slug === slug,
  );
  return Math.max(initialVisibleEntries, requestedIndex + 1);
}

function changelogSlugFromHash(hash: string) {
  return hash.startsWith("#") ? hash.slice(1) : hash;
}

function changelogDateValue(date: ChangelogDate) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date: ChangelogDate) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(changelogDateValue(date));
}
