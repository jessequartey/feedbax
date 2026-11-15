import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

import { PostDetailSkeleton, PostDetailView } from "@/components/portal/post-detail";
import { pageTitle } from "@/components/portal/route-head";
import { NotFoundState } from "@/components/portal/states";
import { getPost, listComments } from "@/server/functions";
import { uuid } from "@/server/validation";

export const Route = createFileRoute("/_portal/posts/$postId")({
  loader: async ({ params }) => {
    try {
      uuid(params.postId);
    } catch {
      throw notFound();
    }
    const [post, comments] = await Promise.all([
      getPost({ data: { id: params.postId } }),
      listComments({ data: { postId: params.postId } }),
    ]);
    // A duplicate that was merged into another post sends its visitors to that post.
    if (post.mergedInto)
      throw redirect({ to: "/posts/$postId", params: { postId: post.mergedInto }, replace: true });
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
