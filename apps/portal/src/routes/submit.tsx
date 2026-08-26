import { createFileRoute } from "@tanstack/react-router";

import { RoutedPostCreationForm } from "../routed-post-creation-form";
import { PublicPortalError } from "../public-portal-error";
import { PostCreationSkeleton } from "../post-creation-flow";

export const Route = createFileRoute("/submit")({
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
