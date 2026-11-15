import { createFileRoute, Link } from "@tanstack/react-router";

import { unwrap } from "@/components/admin/use-admin";
import {
  CommentModeration,
  FilterControl,
  PostModeration,
  SimilarGroups,
} from "@/components/admin/moderation";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { buttonVariants } from "@/components/ui/button";
import type { ModerationFilter } from "@/contracts/admin";
import { cn } from "@/lib/utils";
import { adminListComments, adminListPosts, adminSimilarGroups } from "@/server/functions";

type ModerationSearch = {
  view?: "comments" | "similar";
  filter?: "hidden" | "spam";
  sort?: "priority";
  page?: number;
};

function parsePage(raw: unknown): number | undefined {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isInteger(n) && n > 1 && n <= 10_000 ? n : undefined;
}

export const Route = createFileRoute("/_portal/admin/moderation")({
  validateSearch: (raw: Record<string, unknown>): ModerationSearch => ({
    ...(raw.view === "comments" || raw.view === "similar" ? { view: raw.view } : {}),
    ...(raw.view !== "comments" &&
    raw.view !== "similar" &&
    (raw.filter === "hidden" || raw.filter === "spam")
      ? { filter: raw.filter }
      : {}),
    ...(raw.view !== "comments" && raw.view !== "similar" && raw.sort === "priority"
      ? { sort: "priority" as const }
      : {}),
    ...(parsePage(raw.page) ? { page: parsePage(raw.page) } : {}),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) =>
    deps.view === "comments"
      ? ({
          view: "comments",
          comments: await unwrap(adminListComments({ data: { page: deps.page } })),
        } as const)
      : deps.view === "similar"
        ? ({ view: "similar", similar: await unwrap(adminSimilarGroups()) } as const)
        : ({
            view: "posts",
            posts: await unwrap(
              adminListPosts({ data: { filter: deps.filter, page: deps.page, sort: deps.sort } }),
            ),
          } as const),
  component: ModerationPage,
});

function ModerationPage() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const view = data.view;
  const tab = (active: boolean) =>
    cn(
      buttonVariants({ variant: active ? "secondary" : "ghost" }),
      "h-9 px-4 text-sm max-md:h-11",
      !active && "text-muted-foreground",
    );
  return (
    <section aria-label="Moderation">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-1" role="group" aria-label="What to moderate">
          <Link
            to="/admin/moderation"
            search={{}}
            aria-current={view === "posts" ? "true" : undefined}
            className={tab(view === "posts")}
          >
            Posts
          </Link>
          <Link
            to="/admin/moderation"
            search={{ view: "comments" }}
            aria-current={view === "comments" ? "true" : undefined}
            className={tab(view === "comments")}
          >
            Comments
          </Link>
          <Link
            to="/admin/moderation"
            search={{ view: "similar" }}
            aria-current={view === "similar" ? "true" : undefined}
            className={tab(view === "similar")}
          >
            Similar groups
          </Link>
        </div>
        {data.view === "posts" ? (
          <div className="flex flex-col gap-3 md:flex-row">
            <ToggleGroup
              aria-label="Sort moderation posts"
              variant="outline"
              spacing={0}
              value={[search.sort ?? "new"]}
              onValueChange={(next) => {
                if (next[0])
                  void navigate({
                    search: (prev) => ({
                      ...prev,
                      page: undefined,
                      sort: next[0] === "priority" ? "priority" : undefined,
                    }),
                    replace: true,
                  });
              }}
            >
              <ToggleGroupItem value="new" className="h-9 flex-1 px-4 max-md:h-11">
                Newest
              </ToggleGroupItem>
              <ToggleGroupItem value="priority" className="h-9 flex-1 px-4 max-md:h-11">
                Priority
              </ToggleGroupItem>
            </ToggleGroup>
            <FilterControl
              value={(search.filter ?? "all") as ModerationFilter}
              onChange={(filter) =>
                void navigate({
                  search: (prev) => ({
                    ...prev,
                    page: undefined,
                    filter: filter === "all" ? undefined : filter,
                  }),
                  replace: true,
                })
              }
            />
          </div>
        ) : null}
      </div>
      {data.view === "posts" ? (
        <PostModeration
          page={data.posts}
          filter={search.filter ?? "all"}
          onPage={(page) =>
            void navigate({ search: (prev) => ({ ...prev, page: page > 1 ? page : undefined }) })
          }
        />
      ) : data.view === "similar" ? (
        <SimilarGroups result={data.similar} />
      ) : (
        <CommentModeration
          page={data.comments}
          onPage={(page) =>
            void navigate({ search: (prev) => ({ ...prev, page: page > 1 ? page : undefined }) })
          }
        />
      )}
    </section>
  );
}
