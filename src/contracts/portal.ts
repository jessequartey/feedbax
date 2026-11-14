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
  ViewerUser,
  VoteResult,
} from "./domain.ts";
import type { PublicConfig } from "./config.ts";

export type Viewer = { user: ViewerUser | null; config: PublicConfig };
export type PortalFunctions = {
  getViewer: () => Viewer;
  listPosts: (data: ListPostsInput) => Page<PostSummary>;
  listMyPosts: (data: ListPostsInput) => Page<PostSummary>; // empty page when signed out
  getPost: (data: { id: string }) => PostDetail; // throws notFound()
  listComments: (data: { postId: string; page?: number }) => Page<CommentView>; // ascending
  getRoadmap: (data: { q?: string; category?: Category }) => RoadmapResult;
  createPost: (data: FormData) => ApiResult<CreatePostResult>; // id,title,body,category,image×0–3
  addComment: (data: { id: string; postId: string; body: string }) => ApiResult<CommentView>;
  setVote: (data: { postId: string; voted: boolean }) => ApiResult<VoteResult>;
};
