import { createFileRoute } from "@tanstack/react-router";

import { PublicFeedbackIndex } from "../public-feedback-index";
import { publicFeedbackSearch } from "../public-feedback-page";
import { getPublicFeedbackPage } from "../public-feedback-server-function";

export const Route = createFileRoute("/")({
  validateSearch: publicFeedbackSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getPublicFeedbackPage({ data: deps }),
  component: HomeComponent,
});

function HomeComponent() {
  const page = Route.useLoaderData();
  const search = Route.useSearch();

  return <PublicFeedbackIndex page={page} search={search} />;
}
