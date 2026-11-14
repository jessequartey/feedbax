import { createFileRoute, notFound } from "@tanstack/react-router";

import { ChangelogEntryView, ChangelogSkeleton } from "@/components/portal/changelog";
import { pageTitle } from "@/components/portal/route-head";
import { NotFoundState } from "@/components/portal/states";
import { markdownToText } from "@/lib/markdown";
import { getChangelogEntry } from "@/server/functions";
import { uuid } from "@/server/validation";

export const Route = createFileRoute("/_portal/changelog/$entryId")({
  loader: async ({ params }) => {
    try {
      uuid(params.entryId);
    } catch {
      throw notFound();
    }
    return getChangelogEntry({ data: { id: params.entryId } });
  },
  // Its own head: title, description and Open Graph tags from the entry itself.
  head: ({ loaderData, matches }) => {
    const base = pageTitle(matches, loaderData?.title);
    if (!loaderData) return base;
    const description = markdownToText(loaderData.body) || "A product update.";
    return {
      meta: [
        ...base.meta,
        { name: "description", content: description },
        { property: "og:type", content: "article" },
        { property: "og:title", content: loaderData.title },
        { property: "og:description", content: description },
        { property: "article:published_time", content: loaderData.publishedAt },
      ],
    };
  },
  pendingComponent: ChangelogSkeleton,
  notFoundComponent: () => (
    <NotFoundState
      title="Update not found"
      description="This update doesn't exist, or it hasn't been published."
    />
  ),
  component: EntryPage,
});

function EntryPage() {
  return <ChangelogEntryView entry={Route.useLoaderData()} />;
}
