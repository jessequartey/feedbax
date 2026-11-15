import * as React from "react";
import { Link } from "@tanstack/react-router";
import {
  BarChart3Icon,
  ClockIcon,
  InboxIcon,
  MessageSquareIcon,
  RocketIcon,
  ThumbsUpIcon,
  UsersIcon,
} from "lucide-react";

import { CATEGORY_ICONS, STATUS_ICONS, StatusBadge } from "@/components/portal/post-badges";
import { plural } from "@/components/portal/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { AdminInsights, AdminInsightsVolumePoint, InsightsRange } from "@/contracts/admin";
import { CATEGORY_LABELS, STATUS_LABELS, type Category, type Status } from "@/contracts/domain";
import { cn } from "@/lib/utils";

const RANGES: { value: InsightsRange; label: string; caption: string }[] = [
  { value: "7d", label: "7 days", caption: "In the last 7 days" },
  { value: "30d", label: "30 days", caption: "In the last 30 days" },
  { value: "90d", label: "90 days", caption: "In the last 90 days" },
];

const STATUSES: Status[] = ["open", "planned", "in_progress", "done", "closed"];
const CATEGORIES: Category[] = ["feature", "bug", "general"];

// UTC, so the server render and the browser print the same text.
const updatedFormat = new Intl.DateTimeFormat("en-US", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "UTC",
});
const formatUpdated = (iso: string) => `${updatedFormat.format(new Date(iso))} UTC`;

function formatHours(hours: number | null): string {
  if (hours === null) return "—";
  if (hours > 0 && hours < 0.1) return "< 0.1 hrs";
  if (hours >= 48) return `${(hours / 24).toFixed(1)} days`;
  return `${hours.toFixed(1)} hrs`;
}

function formatDays(days: number | null): string {
  if (days === null) return "—";
  if (days > 0 && days < 0.1) return "< 0.1 days";
  return `${days.toFixed(1)} days`;
}

function SummaryCard({
  title,
  value,
  hint,
  icon: Icon,
}: {
  title: string;
  value: string;
  hint: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-1">
        <CardDescription className="text-xs font-medium">{title}</CardDescription>
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

function VolumeChart({ series }: { series: AdminInsightsVolumePoint[] }) {
  const [selectedIndex, setSelectedIndex] = React.useState<number | null>(null);
  const hasActivity = series.some((item) => item.posts > 0 || item.votes > 0 || item.comments > 0);

  React.useEffect(() => {
    setSelectedIndex(null);
  }, [series]);

  if (!hasActivity) {
    return (
      <Empty className="border py-10">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BarChart3Icon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>No activity in this range</EmptyTitle>
          <EmptyDescription>
            Visible posts, votes, and comments from this window will appear here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const maxTotal = Math.max(
    1,
    ...series.map((point) => point.posts + point.votes + point.comments),
  );
  const active = selectedIndex !== null && series[selectedIndex] ? series[selectedIndex] : null;
  const first = series[0];
  const mid = series.length > 2 ? series[Math.floor(series.length / 2)] : null;
  const last = series[series.length - 1];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 bg-foreground" aria-hidden="true" />
            Posts
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 bg-foreground/50" aria-hidden="true" />
            Comments
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2.5 bg-foreground/20" aria-hidden="true" />
            Votes
          </span>
        </div>
        <div aria-live="polite" className="min-h-4 tabular-nums">
          {active ? (
            <span className="font-medium text-foreground">
              {active.label}: {plural(active.posts, "post")} · {plural(active.comments, "comment")}{" "}
              · {plural(active.votes, "vote")}
            </span>
          ) : (
            <span>Select or focus a bar to inspect</span>
          )}
        </div>
      </div>

      <div
        role="group"
        aria-label="Feedback activity over time"
        className="flex h-40 items-end gap-0.5 border-b pb-1 sm:gap-1"
      >
        {series.map((point, index) => {
          const total = point.posts + point.votes + point.comments;
          const totalPct = total > 0 ? Math.max(4, Math.round((total / maxTotal) * 100)) : 0;
          const postPct = total > 0 ? (point.posts / total) * 100 : 0;
          const commentPct = total > 0 ? (point.comments / total) * 100 : 0;
          const votePct = total > 0 ? (point.votes / total) * 100 : 0;
          const isActive = selectedIndex === index;
          return (
            <button
              key={point.date}
              type="button"
              onMouseEnter={() => setSelectedIndex(index)}
              onMouseLeave={() => setSelectedIndex((prev) => (prev === index ? null : prev))}
              onFocus={() => setSelectedIndex(index)}
              onBlur={() => setSelectedIndex((prev) => (prev === index ? null : prev))}
              onClick={() => setSelectedIndex((prev) => (prev === index ? null : index))}
              aria-label={`${point.label}: ${plural(point.posts, "post")}, ${plural(point.comments, "comment")}, ${plural(point.votes, "vote")}`}
              aria-pressed={isActive}
              className={cn(
                "group relative flex h-full min-w-0 flex-1 flex-col justify-end rounded-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                selectedIndex !== null && !isActive && "opacity-55",
              )}
            >
              {total > 0 ? (
                <span
                  className="flex w-full flex-col overflow-hidden"
                  style={{ height: `${totalPct}%` }}
                >
                  {point.votes > 0 ? (
                    <span className="w-full bg-foreground/20" style={{ height: `${votePct}%` }} />
                  ) : null}
                  {point.comments > 0 ? (
                    <span
                      className="w-full bg-foreground/50"
                      style={{ height: `${commentPct}%` }}
                    />
                  ) : null}
                  {point.posts > 0 ? (
                    <span className="w-full bg-foreground" style={{ height: `${postPct}%` }} />
                  ) : null}
                </span>
              ) : (
                <span className="h-[2px] w-full bg-muted" />
              )}
            </button>
          );
        })}
      </div>

      {first && last ? (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{first.label}</span>
          {mid && mid.date !== first.date && mid.date !== last.date ? (
            <span>{mid.label}</span>
          ) : null}
          {last.date !== first.date ? <span>{last.label}</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function BreakdownBar({
  label,
  count,
  total,
  icon: Icon,
}: {
  label: string;
  count: number;
  total: number;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <Progress value={pct} className="w-full gap-2">
      <div className="flex w-full items-center justify-between gap-2">
        <ProgressLabel className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
          {label}
        </ProgressLabel>
        <ProgressValue className="text-xs text-muted-foreground tabular-nums">
          {() => `${count.toLocaleString("en-US")} (${pct}%)`}
        </ProgressValue>
      </div>
    </Progress>
  );
}

export function InsightsPending() {
  return (
    <div aria-busy="true" aria-label="Loading insights" className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-9 w-full md:w-72" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    </div>
  );
}

export function InsightsDashboard({
  insights,
  onRangeChange,
  isPending = false,
}: {
  insights: AdminInsights;
  onRangeChange: (range: InsightsRange) => void;
  isPending?: boolean;
}) {
  const rangeMeta = RANGES.find((item) => item.value === insights.range) ?? RANGES[1]!;
  const totalAllPosts = STATUSES.reduce((sum, status) => sum + insights.statusBreakdown[status], 0);

  return (
    <div
      className={cn("space-y-6 transition-opacity", isPending && "opacity-70")}
      aria-busy={isPending}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-muted-foreground">
          Visible feedback only — hidden, spam, and merged posts are excluded. Updated{" "}
          <time dateTime={insights.generatedAt}>{formatUpdated(insights.generatedAt)}</time>;
          numbers refresh at most every 5 minutes.
        </p>
        <ToggleGroup
          aria-label="Insights time range"
          variant="outline"
          spacing={0}
          value={[insights.range]}
          onValueChange={(next) => {
            const chosen = next[0] as InsightsRange | undefined;
            if (chosen && chosen !== insights.range) onRangeChange(chosen);
          }}
          className="w-full md:w-fit"
        >
          {RANGES.map((item) => (
            <ToggleGroupItem
              key={item.value}
              value={item.value}
              className="h-9 flex-1 px-2.5 text-xs max-md:h-11 sm:px-3.5 sm:text-sm md:flex-none"
            >
              {item.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          title="Feedback volume"
          value={insights.totals.posts.toLocaleString("en-US")}
          hint={`${plural(insights.totals.comments, "comment")} · ${plural(insights.totals.shipped, "shipped")}`}
          icon={MessageSquareIcon}
        />
        <SummaryCard
          title="Votes cast"
          value={insights.totals.votes.toLocaleString("en-US")}
          hint={rangeMeta.caption}
          icon={ThumbsUpIcon}
        />
        <SummaryCard
          title="Median response time"
          value={formatHours(insights.timing.medianFirstResponseHours)}
          hint="First admin reply, status move, or release"
          icon={ClockIcon}
        />
        <SummaryCard
          title="Median time to delivery"
          value={formatDays(insights.timing.medianTimeToDeliveryDays)}
          hint="Post creation to shipped"
          icon={RocketIcon}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity over time</CardTitle>
          <CardDescription>
            New posts, comments, and votes ({rangeMeta.label.toLowerCase()}).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VolumeChart series={insights.volumeSeries} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Status breakdown</CardTitle>
            <CardDescription>All-time visible posts across workflow stages.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {totalAllPosts === 0 ? (
              <Empty className="border py-8">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <InboxIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>No posts yet</EmptyTitle>
                  <EmptyDescription>
                    Status counts appear once visible feedback is submitted.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              STATUSES.map((status) => (
                <BreakdownBar
                  key={status}
                  label={STATUS_LABELS[status]}
                  count={insights.statusBreakdown[status]}
                  total={totalAllPosts}
                  icon={STATUS_ICONS[status]}
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Category breakdown</CardTitle>
            <CardDescription>All-time visible posts by feedback category.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {totalAllPosts === 0 ? (
              <Empty className="border py-8">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <InboxIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>No posts yet</EmptyTitle>
                  <EmptyDescription>
                    Category counts appear once visible feedback is submitted.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              CATEGORIES.map((category) => (
                <BreakdownBar
                  key={category}
                  label={CATEGORY_LABELS[category]}
                  count={insights.categoryBreakdown[category]}
                  total={totalAllPosts}
                  icon={CATEGORY_ICONS[category]}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Most voted in this period</CardTitle>
            <CardDescription>
              Open, planned, and in-progress requests by votes cast in this range.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {insights.popularRequests.length === 0 ? (
              <Empty className="border py-8">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <InboxIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>No votes in this period</EmptyTitle>
                  <EmptyDescription>
                    Votes on open, planned, or in-progress requests will appear here.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Request</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Votes</TableHead>
                    <TableHead className="text-right">Comments</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {insights.popularRequests.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="max-w-[180px] whitespace-normal sm:max-w-[260px]">
                        <Link
                          to="/posts/$postId"
                          params={{ postId: item.id }}
                          className="line-clamp-2 font-medium underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
                        >
                          {item.title}
                        </Link>
                        {item.priority !== null ? (
                          <Badge
                            variant="outline"
                            className="mt-1 h-5 px-1.5 text-[11px] font-normal"
                          >
                            P{item.priority}
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={item.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {item.votes.toLocaleString("en-US")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {item.comments.toLocaleString("en-US")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Active contributors</CardTitle>
            <CardDescription>
              Top signed-in participants ({rangeMeta.label.toLowerCase()}). Anonymous visitors are
              excluded.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {insights.topContributors.length === 0 ? (
              <Empty className="border py-8">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <UsersIcon aria-hidden="true" />
                  </EmptyMedia>
                  <EmptyTitle>No signed-in contributors</EmptyTitle>
                  <EmptyDescription>
                    Posts, comments, and votes from signed-in accounts in this range will appear
                    here.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Contributor</TableHead>
                    <TableHead className="text-right">Posts</TableHead>
                    <TableHead className="text-right">Comments</TableHead>
                    <TableHead className="text-right">Votes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {insights.topContributors.map((contributor) => (
                    <TableRow key={contributor.id}>
                      <TableCell className="max-w-[160px] truncate font-medium">
                        {contributor.name}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {contributor.posts.toLocaleString("en-US")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {contributor.comments.toLocaleString("en-US")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {contributor.votes.toLocaleString("en-US")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
