import type {
  ChangelogPage as PageData,
  PublicChangelogEntry,
} from "@feedbax/changelog";
import { Badge } from "@feedbax/ui/components/badge";
import { Button } from "@feedbax/ui/components/button";
import { ButtonGroup } from "@feedbax/ui/components/button-group";
import { cn } from "@feedbax/ui/lib/utils";
import { useRouterState } from "@tanstack/react-router";
import { ChevronDown, Link2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CommandPaletteTrigger } from "./components/command-palette";

export type LoadChangelogPage = (input: {
  cursor?: string;
  label?: string;
}) => Promise<PageData>;

const emptyPage: PageData = { items: [] };

export function ChangelogPage({
  initialPage = emptyPage,
  loadPage = async () => emptyPage,
}: { initialPage?: PageData; loadPage?: LoadChangelogPage } = {}) {
  const locationHash = useRouterState({
    select: (state) => state.location.hash,
  });
  const [selectedLabel, setSelectedLabel] = useState<string>();
  const [page, setPage] = useState(initialPage);
  const [loading, setLoading] = useState(false);
  const labels = useMemo(
    () => [...new Set(initialPage.items.flatMap((entry) => entry.labels))],
    [initialPage.items],
  );

  async function replaceForLabel(label?: string) {
    setSelectedLabel(label);
    setLoading(true);
    try {
      setPage(await loadPage(label ? { label } : {}));
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!page.nextCursor) return;
    setLoading(true);
    try {
      const next = await loadPage({
        cursor: page.nextCursor,
        ...(selectedLabel ? { label: selectedLabel } : {}),
      });
      setPage({
        items: [...page.items, ...next.items],
        ...(next.nextCursor ? { nextCursor: next.nextCursor } : {}),
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const slug = locationHash.startsWith("#")
      ? locationHash.slice(1)
      : locationHash;
    if (!slug) return;
    const target = document.getElementById(slug);
    if (target) {
      target.scrollIntoView?.({ block: "start" });
    } else if (page.nextCursor && !loading && !selectedLabel) {
      void loadMore();
    }
  }, [
    locationHash,
    loading,
    page.items.length,
    page.nextCursor,
    selectedLabel,
  ]);

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
          {[undefined, ...labels].map((label) => (
            <Button
              className="h-11 md:h-8"
              key={label ?? "all"}
              type="button"
              variant="outline"
              aria-pressed={selectedLabel === label}
              disabled={loading}
              onClick={() => void replaceForLabel(label)}
            >
              {label ?? "All"}
            </Button>
          ))}
        </ButtonGroup>
        <CommandPaletteTrigger className="h-11 md:h-10" />
      </div>
      <ol className="changelog-timeline" aria-label="Product updates">
        {page.items.map((entry) => (
          <TimelineEntry entry={entry} key={entry.slug} />
        ))}
      </ol>
      {page.nextCursor ? (
        <div className="changelog-load-more">
          <Button
            className="h-11 min-w-64 gap-2 text-sm md:h-10"
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => void loadMore()}
          >
            Load more updates
            <ChevronDown aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </main>
  );
}

function TimelineEntry({ entry }: { entry: PublicChangelogEntry }) {
  const image = useUnexpiredImage(entry.image);
  return (
    <li className="changelog-timeline-entry">
      <time dateTime={entry.date}>{formatDate(entry.date)}</time>
      <span className="changelog-timeline-marker" aria-hidden="true" />
      <article id={entry.slug} tabIndex={-1}>
        <div className={cn("changelog-entry-layout", image && "has-image")}>
          <div className="changelog-entry-copy">
            <div className="changelog-labels" aria-label="Labels">
              {entry.labels.map((label) => (
                <Label key={label} label={label} />
              ))}
            </div>
            <div className="changelog-entry-title">
              <h2>{entry.title}</h2>
              <a href={`#${entry.slug}`} aria-label={`Link to ${entry.title}`}>
                <Link2 aria-hidden="true" />
              </a>
            </div>
            <p className="changelog-entry-summary">{entry.summary}</p>
            <div className="changelog-entry-body">
              <p>{entry.body}</p>
            </div>
          </div>
          {image ? (
            <img src={image.src} alt={image.alt} width={760} height={420} />
          ) : null}
        </div>
      </article>
    </li>
  );
}

function useUnexpiredImage(image: PublicChangelogEntry["image"]) {
  const expiry = image?.expiresAt
    ? new Date(image.expiresAt).getTime()
    : undefined;
  const [available, setAvailable] = useState(
    () => expiry === undefined || expiry > Date.now(),
  );

  useEffect(() => {
    if (!image || expiry === undefined) {
      setAvailable(Boolean(image));
      return;
    }
    const remaining = expiry - Date.now();
    if (remaining <= 0) {
      setAvailable(false);
      return;
    }
    setAvailable(true);
    const timeout = window.setTimeout(() => setAvailable(false), remaining);
    return () => window.clearTimeout(timeout);
  }, [expiry, image]);

  return available && (expiry === undefined || expiry > Date.now())
    ? image
    : undefined;
}

function Label({ label }: { label: string }) {
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

function formatDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
