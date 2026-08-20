import { createFileRoute, notFound } from "@tanstack/react-router";

import { PublicFeedbackItemDetail } from "../public-feedback-item-detail";
import { getPublicFeedbackItem } from "../public-feedback-item-server-function";

export const Route = createFileRoute("/feedback/$id/$slug")({
  loader: async ({ params }) => {
    const item = await getPublicFeedbackItem({ data: params });
    if (!item) throw notFound();
    return item;
  },
  component: FeedbackItemComponent,
  notFoundComponent: FeedbackItemNotFound,
});

function FeedbackItemComponent() {
  return <PublicFeedbackItemDetail item={Route.useLoaderData()} />;
}

function FeedbackItemNotFound() {
  return (
    <main className="feedback-detail feedback-detail-missing">
      <p className="feedback-eyebrow">Feedback unavailable</p>
      <h1>This Feedback Item isn’t public.</h1>
      <p>It may not exist, or it may not be published yet.</p>
      <a className="feedback-detail-back" href="/">
        Browse published feedback
      </a>
    </main>
  );
}
