import { ListDialogOutlet } from "@/components/portal/list-dialog-outlet";
import { parseDialogSearch } from "@/components/portal/list-dialog-navigation";
import { createFileRoute } from "@tanstack/react-router";

import { PostBrowser, PostBrowserSkeleton } from "@/components/portal/post-browser";
import {
  clearFilters,
  parseBoardSearch,
  patchSearch,
  toListInput,
} from "@/components/portal/portal-search";
import { pageTitle } from "@/components/portal/route-head";
import { listPosts } from "@/server/functions";

const TITLE = "Feedback";
const DESCRIPTION = "Share ideas and vote on what matters.";

export const Route = createFileRoute("/_portal/")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...parseBoardSearch(search),
    ...parseDialogSearch(search),
  }),
  loaderDeps: ({ search }) => parseBoardSearch(search),
  loader: ({ deps }) => listPosts({ data: toListInput(deps) }),
  head: ({ matches }) => pageTitle(matches),
  pendingComponent: () => <PostBrowserSkeleton title={TITLE} description={DESCRIPTION} />,
  component: BoardPage,
});

function BoardPage() {
  const search = Route.useSearch();
  const page = Route.useLoaderData();
  const navigate = Route.useNavigate();
  return (
    <>
      <PostBrowser
        title={TITLE}
        description={DESCRIPTION}
        kind="board"
        search={search}
        page={page}
        onChange={(patch) => void navigate({ search: (prev) => patchSearch(prev, patch) })}
        onClear={() => void navigate({ search: (prev) => clearFilters(prev) })}
      />
      <ListDialogOutlet dialog={search.dialog} />
    </>
  );
}
