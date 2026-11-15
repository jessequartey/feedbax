import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, RssIcon, SparklesIcon } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import type { ChangelogEntry, ChangelogPage } from "@/contracts/changelog";
import { cn } from "@/lib/utils";
import { formatDate } from "./format";
import { Markdown } from "./markdown";
import { PageHeader } from "./page-header";
import { PaginationBar } from "./pagination-bar";
import { StatusBadge } from "./post-badges";
import { EmptyState } from "./states";

const layout = "mx-auto w-full max-w-[1440px] px-4 md:px-6 lg:px-8";

/** One entry: title, date, rendered body and the posts it shipped. */
export function ChangelogEntryCard({
  entry,
  asPage = false,
}: {
  entry: ChangelogEntry;
  /** On the detail page the title is the page's h1 and is not a link. */
  asPage?: boolean;
}) {
  const titleId = `entry-${entry.id}`;
  return (
    <article
      aria-labelledby={titleId}
      className="grid gap-3 py-8 md:grid-cols-[10rem_minmax(0,1fr)] md:gap-8"
    >
      <time
        dateTime={entry.publishedAt}
        className="text-sm text-muted-foreground md:pt-2 md:text-right"
      >
        {formatDate(entry.publishedAt)}
      </time>
      <div className="min-w-0 max-w-3xl">
        {asPage ? (
          <h1
            id={titleId}
            className="text-2xl leading-tight font-semibold tracking-tight break-words md:text-3xl"
          >
            {entry.title}
          </h1>
        ) : (
          <h2
            id={titleId}
            className="text-xl leading-tight font-semibold tracking-tight break-words md:text-2xl"
          >
            <Link
              to="/changelog/$entryId"
              params={{ entryId: entry.id }}
              className="underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              {entry.title}
            </Link>
          </h2>
        )}
        {entry.body.trim() ? <Markdown source={entry.body} className="mt-4" /> : null}
        {entry.posts.length > 0 ? (
          <section aria-label="Shipped feedback" className="mt-5">
            <h3 className="text-sm font-medium">Shipped</h3>
            <ul className="mt-2 divide-y border">
              {entry.posts.map((post) => (
                <li key={post.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <Link
                    to="/posts/$postId"
                    params={{ postId: post.id }}
                    className="min-w-0 truncate text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
                  >
                    {post.title}
                  </Link>
                  <StatusBadge status={post.status} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </article>
  );
}

export function RssLink({ className }: { className?: string }) {
  return (
    <a
      href="/changelog.rss"
      className={cn(buttonVariants({ variant: "outline" }), "h-9 max-md:h-11", className)}
    >
      <RssIcon aria-hidden="true" /> RSS feed
    </a>
  );
}

export function ChangelogView({
  page,
  onPage,
}: {
  page: ChangelogPage;
  onPage: (page: number) => void;
}) {
  return (
    <div className={`${layout} py-6 md:py-10`}>
      <PageHeader
        title="Changelog"
        description="New features, fixes and what shipped from your feedback."
        actions={<RssLink />}
      />
      {page.items.length === 0 ? (
        <div className="mt-8 border">
          <EmptyState
            icon={SparklesIcon}
            title="Nothing here yet"
            description="Product updates will be posted here as they ship."
          />
        </div>
      ) : (
        <>
          <div className="mt-4 divide-y">
            {page.items.map((entry) => (
              <ChangelogEntryCard key={entry.id} entry={entry} />
            ))}
          </div>
          <PaginationBar page={page} onPage={onPage} />
        </>
      )}
    </div>
  );
}

export function ChangelogEntryView({ entry }: { entry: ChangelogEntry }) {
  return (
    <div className={`${layout} py-6 md:py-10`}>
      <Link
        to="/changelog"
        className="inline-flex h-9 items-center gap-1.5 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 max-md:h-11"
      >
        <ArrowLeftIcon className="size-4" aria-hidden="true" /> All updates
      </Link>
      <ChangelogEntryCard entry={entry} asPage />
    </div>
  );
}

export function ChangelogSkeleton() {
  return (
    <div className={`${layout} py-6 md:py-10`} aria-busy="true">
      <Skeleton className="h-10 w-48" />
      <Skeleton className="mt-3 h-4 w-80 max-w-full" />
      <div className="mt-10 grid gap-8">
        {[0, 1].map((n) => (
          <div key={n} className="grid gap-3 md:grid-cols-[10rem_minmax(0,1fr)] md:gap-8">
            <Skeleton className="h-4 w-24 md:ml-auto" />
            <div>
              <Skeleton className="h-7 w-2/3" />
              <Skeleton className="mt-4 h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-5/6" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
