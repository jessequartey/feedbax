import { createFileRoute } from "@tanstack/react-router";

import { RoutedPostCreationForm } from "../routed-post-creation-form";
import { PublicPortalError } from "../public-portal-error";

export const Route = createFileRoute("/submit")({
  component: SubmitComponent,
  errorComponent: PublicPortalError,
});

function SubmitComponent() {
  return (
    <main className="feedback-index submission-page">
      <RoutedPostCreationForm />
    </main>
  );
}
