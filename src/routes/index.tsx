// W0 placeholder. W3 replaces this with the board.
import { createFileRoute } from "@tanstack/react-router";
import { listPosts } from "../server/functions.ts";

export const Route = createFileRoute("/")({
  loader: () => listPosts({ data: { sort: "trending" } }),
  component: Home,
});

function Home() {
  const page = Route.useLoaderData();
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">Feedbax</h1>
      <p className="text-muted-foreground">{page.total} posts (fixture data)</p>
    </main>
  );
}
