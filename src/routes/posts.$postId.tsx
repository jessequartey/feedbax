import { createFileRoute } from "@tanstack/react-router";

import { PostDetailSkeleton, PostDetailView } from "@/components/portal/post-detail";
import { pageTitle } from "@/components/portal/route-head";
import { NotFoundState } from "@/components/portal/states";
import { getPost, listComments } from "@/server/functions";

export const Route = createFileRoute("/posts/$postId")({
  loader: async ({ params }) => {
    const [post, comments] = await Promise.all([
      getPost({ data: { id: params.postId } }),
      listComments({ data: { postId: params.postId } }),
    ]);
    return { post, comments };
  },
  head: ({ loaderData, matches }) => pageTitle(matches, loaderData?.post.title),
  pendingComponent: PostDetailSkeleton,
  notFoundComponent: () => (
    <NotFoundState
      title="Post not found"
      description="This post doesn't exist, or it was removed."
    />
  ),
  component: PostPage,
});

function PostPage() {
  const { post, comments } = Route.useLoaderData();
  return <PostDetailView post={post} comments={comments} />;
}
