import { createFileRoute } from "@tanstack/react-router";

import { PublicPostIndex } from "../public-feedback-index";
import { PublicPortalError } from "../public-portal-error";
import { publicPostSearch } from "../public-feedback-page";
import { publicPostsQuery } from "../post-queries";
import { useSuspenseInfiniteQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/")({
  validateSearch: publicPostSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps, context }) =>
    context.queryClient.ensureInfiniteQueryData(publicPostsQuery(deps)),
  component: HomeComponent,
  errorComponent: PublicPortalError,
});

function HomeComponent() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const query = useSuspenseInfiniteQuery(publicPostsQuery(search));
  const pages = query.data.pages;
  const page = {
    items: pages.flatMap((page) => page.items),
    nextCursor: pages.at(-1)?.nextCursor,
  };

  return (
    <PublicPostIndex
      page={page}
      search={search}
      loadMore={() => query.fetchNextPage()}
      loadingMore={query.isFetchingNextPage}
      loadMoreError={query.isFetchNextPageError}
      onSearchChange={(nextSearch) =>
        navigate({ search: nextSearch, replace: false })
      }
      maskPostLinks
    />
  );
}
