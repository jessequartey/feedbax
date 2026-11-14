// W0 STUB (TanStack Start 1.169 spells the validation step `.validator`). W1 owns this file from handoff onward and replaces the bodies with the real
// implementation. The exports, names and signatures are frozen by src/contracts/portal.ts;
// tests/fixtures/portal-conformance.ts fails to compile if they drift.
import { notFound } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type {
  ApiResult,
  Category,
  CommentView,
  CreatePostResult,
  ListPostsInput,
  Page,
  PostDetail,
  PostSummary,
  RoadmapResult,
  VoteResult,
} from "../contracts/domain.ts";
import type { Viewer } from "../contracts/portal.ts";
import {
  fixtureAddComment,
  fixtureCreatePost,
  fixtureGetPost,
  fixtureListComments,
  fixtureListMyPosts,
  fixtureListPosts,
  fixtureRoadmap,
  fixtureSetVote,
  fixtureViewer,
} from "../../tests/fixtures/portal.ts";

export const getViewer = createServerFn({ method: "GET" }).handler(
  async (): Promise<Viewer> => fixtureViewer,
);

export const listPosts = createServerFn({ method: "GET" })
  .validator((data: ListPostsInput) => data)
  .handler(async ({ data }): Promise<Page<PostSummary>> => fixtureListPosts(data));

export const listMyPosts = createServerFn({ method: "GET" })
  .validator((data: ListPostsInput) => data)
  .handler(async ({ data }): Promise<Page<PostSummary>> => fixtureListMyPosts(data));

export const getPost = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }): Promise<PostDetail> => {
    const post = fixtureGetPost(data.id);
    if (!post) throw notFound();
    return post;
  });

export const listComments = createServerFn({ method: "GET" })
  .validator((data: { postId: string; page?: number }) => data)
  .handler(async ({ data }): Promise<Page<CommentView>> =>
    fixtureListComments(data.postId, data.page),
  );

export const getRoadmap = createServerFn({ method: "GET" })
  .validator((data: { q?: string; category?: Category }) => data)
  .handler(async ({ data }): Promise<RoadmapResult> => fixtureRoadmap(data));

export const createPost = createServerFn({ method: "POST" })
  .validator((data: FormData) => data)
  .handler(async ({ data }): Promise<ApiResult<CreatePostResult>> => fixtureCreatePost(data));

export const addComment = createServerFn({ method: "POST" })
  .validator((data: { id: string; postId: string; body: string }) => data)
  .handler(async ({ data }): Promise<ApiResult<CommentView>> => fixtureAddComment(data));

export const setVote = createServerFn({ method: "POST" })
  .validator((data: { postId: string; voted: boolean }) => data)
  .handler(async ({ data }): Promise<ApiResult<VoteResult>> => fixtureSetVote(data));
