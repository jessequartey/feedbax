import { createFileRoute } from "@tanstack/react-router";

import { RoutedPostCreationForm } from "../routed-post-creation-form";
import { PublicPortalError } from "../public-portal-error";
import { PostCreationSkeleton } from "../post-creation-flow";
import feedbax from "../feedbax";
import { createRouteHead } from "../portal-head";

export const Route = createFileRoute("/submit")({
  head: () =>
    createRouteHead(feedbax.product, {
      title: "Share feedback",
      description: `Share feedback with ${feedbax.product.name}.`,
      path: "/submit",
      noIndex: true,
    }),
  component: SubmitComponent,
  pendingComponent: PostCreationSkeleton,
  errorComponent: PublicPortalError,
});

function SubmitComponent() {
  return (
    <main className="feedback-index submission-page">
      <RoutedPostCreationForm />
    </main>
  );
}
