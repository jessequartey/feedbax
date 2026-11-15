import { createFileRoute } from "@tanstack/react-router";

import { PostDetailSkeleton, PostDetailView } from "@/components/portal/post-detail";
import { pageTitle } from "@/components/portal/route-head";
import { NotFoundState } from "@/components/portal/states";
import { loadPost } from "@/components/portal/load-post";

export const Route = createFileRoute("/_portal/posts/$postId")({
  loader: ({ params }) => loadPost(params.postId),
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
