import { createFileRoute } from "@tanstack/react-router";

import {
  PublicPostFeedSkeleton,
  PublicPostIndex,
} from "../public-feedback-index";
import { PublicPortalError } from "../public-portal-error";
import { publicPostSearch } from "../public-feedback-page";
import { publicPostsQuery, type FetchPublicPostsPage } from "../post-queries";
import { getPublicPostPage } from "../public-feedback-server-function";
import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { useTransition } from "react";

const fetchPublicPostsPage: FetchPublicPostsPage = (search) =>
  getPublicPostPage({ data: search });

export const Route = createFileRoute("/")({
  validateSearch: publicPostSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ deps, context }) =>
    context.queryClient.ensureInfiniteQueryData(
      publicPostsQuery(deps, fetchPublicPostsPage),
    ),
  component: HomeComponent,
  pendingComponent: PublicPostFeedSkeleton,
  errorComponent: PublicPortalError,
});

function HomeComponent() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [pending, startTransition] = useTransition();
  const query = useSuspenseInfiniteQuery(
    publicPostsQuery(search, fetchPublicPostsPage),
  );
  const pages = query.data.pages;
  const page = {
    items: pages.flatMap((page) => page.items),
    nextCursor: pages.at(-1)?.nextCursor,
  };

  return (
    <PublicPostIndex
      page={page}
      search={search}
      pending={pending}
      loadMore={() => query.fetchNextPage()}
      loadingMore={query.isFetchingNextPage}
      loadMoreError={query.isFetchNextPageError}
      onSearchChange={(nextSearch) =>
        startTransition(() => {
          void navigate({ search: nextSearch, replace: false });
        })
      }
      maskPostLinks
    />
  );
}
