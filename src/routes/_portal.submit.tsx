import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/portal/page-header";
import { pageTitle } from "@/components/portal/route-head";
import { SubmitForm } from "@/components/portal/submit-form";

export const Route = createFileRoute("/_portal/submit")({
  head: ({ matches }) => pageTitle(matches, "New post"),
  component: SubmitPage,
});

function SubmitPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6 md:py-10">
      <PageHeader
        title="Create post"
        description="Share an idea, report a bug, or leave feedback."
      />
      <div className="mt-8">
        <SubmitForm />
      </div>
    </div>
  );
}
