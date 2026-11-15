import { ListDialogOutlet } from "@/components/portal/list-dialog-outlet";
import { parseDialogSearch } from "@/components/portal/list-dialog-navigation";
import { createFileRoute } from "@tanstack/react-router";

import { parseRoadmapSearch } from "@/components/portal/portal-search";
import { RoadmapBoard, RoadmapSkeleton } from "@/components/portal/roadmap-board";
import { pageTitle } from "@/components/portal/route-head";
import { getRoadmap } from "@/server/functions";

export const Route = createFileRoute("/_portal/roadmap")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...parseRoadmapSearch(search),
    ...parseDialogSearch(search),
  }),
  loaderDeps: ({ search }) => parseRoadmapSearch(search),
  loader: ({ deps }) => getRoadmap({ data: { q: deps.q, category: deps.category } }),
  head: ({ matches }) => pageTitle(matches, "Roadmap"),
  pendingComponent: RoadmapSkeleton,
  component: RoadmapPage,
});

function RoadmapPage() {
  const search = Route.useSearch();
  const data = Route.useLoaderData();
  const navigate = Route.useNavigate();
  return (
    <>
      <RoadmapBoard
        data={data}
        search={search}
        onChange={(patch) =>
          void navigate({ search: (prev) => parseRoadmapSearch({ ...prev, ...patch }) })
        }
      />
      <ListDialogOutlet dialog={search.dialog} />
    </>
  );
}
