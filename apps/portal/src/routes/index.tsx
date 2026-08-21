import { createFileRoute } from "@tanstack/react-router";

import { PublicFeedbackIndex } from "../public-feedback-index";
import { PublicPortalError } from "../public-portal-error";
import { publicFeedbackSearch } from "../public-feedback-page";
import { publicPostsQuery } from "../post-queries";
import { useSuspenseQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/")({
  validateSearch: publicFeedbackSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps, context }) =>
    context.queryClient.ensureQueryData(publicPostsQuery(deps)),
  component: HomeComponent,
  errorComponent: PublicPortalError,
});

function HomeComponent() {
  const search = Route.useSearch();
  const { data: page } = useSuspenseQuery(publicPostsQuery(search));

  return <PublicFeedbackIndex page={page} search={search} />;
}
