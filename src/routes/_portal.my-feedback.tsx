import { createFileRoute, Link } from "@tanstack/react-router";
import { UserIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PostBrowser, PostBrowserSkeleton } from "@/components/portal/post-browser";
import {
  clearFilters,
  parseBoardSearch,
  patchSearch,
  toListInput,
} from "@/components/portal/portal-search";
import { pageTitle } from "@/components/portal/route-head";
import { EmptyState } from "@/components/portal/states";
import { useViewer } from "@/components/portal/viewer";
import { listMyPosts } from "@/server/functions";

const TITLE = "My feedback";
const DESCRIPTION = "Everything you've posted, and where it stands.";

export const Route = createFileRoute("/_portal/my-feedback")({
  validateSearch: (search: Record<string, unknown>) => parseBoardSearch(search),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => listMyPosts({ data: toListInput(deps) }),
  head: ({ matches }) => pageTitle(matches, TITLE),
  pendingComponent: () => <PostBrowserSkeleton title={TITLE} description={DESCRIPTION} />,
  component: MyFeedbackPage,
});

function MyFeedbackPage() {
  const { user, config } = useViewer();
  const search = Route.useSearch();
  const page = Route.useLoaderData();
  const navigate = Route.useNavigate();

  // Signed out and not in anonymous mode: nothing can be "mine" yet.
  if (!user && !config.anonymous) {
    return (
      <div className="mx-auto w-full max-w-[1440px] px-4 py-10 md:px-8">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">{TITLE}</h1>
        <div className="mt-8 border">
          <EmptyState
            icon={UserIcon}
            title="Sign in to see your feedback"
            description="Your posts, and where they stand, are listed here once you're signed in."
            actions={
              <>
                <Button
                  render={<Link to="/login" search={{ to: "/my-feedback" }} />}
                  nativeButton={false}
                  className="max-md:h-11"
                >
                  Sign in
                </Button>
                <Button
                  variant="outline"
                  render={<Link to="/login" search={{ to: "/my-feedback" }} />}
                  nativeButton={false}
                  className="max-md:h-11"
                >
                  Sign in
                </Button>
              </>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <PostBrowser
      title={TITLE}
      description={user ? DESCRIPTION : "Posts you make in this browser appear here."}
      kind="mine"
      search={search}
      page={page}
      onChange={(patch) => void navigate({ search: (prev) => patchSearch(prev, patch) })}
      onClear={() => void navigate({ search: (prev) => clearFilters(prev) })}
    />
  );
}
