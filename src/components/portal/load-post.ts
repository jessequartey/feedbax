import { notFound, redirect } from "@tanstack/react-router";

import { getPost, listComments } from "@/server/functions";
import { uuid } from "@/server/validation";

/** Shared by the client full-page loader and the list dialog. */
export async function loadPost(postId: string) {
  try {
    uuid(postId);
  } catch {
    throw notFound();
  }
  const [post, comments] = await Promise.all([
    getPost({ data: { id: postId } }),
    listComments({ data: { postId } }),
  ]);
  if (post.mergedInto)
    throw redirect({ to: "/posts/$postId", params: { postId: post.mergedInto }, replace: true });
  return { post, comments };
}
