import type {
  ApiResult,
  Category,
  CommentView,
  CreatePostResult,
  FollowResult,
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
  setPostFollow: (data: { postId: string; following: boolean }) => ApiResult<FollowResult>;
};

/** Per-person email choices (the `email_prefs` row, or its defaults). */
export type EmailPrefs = {
  /** A post you wrote or voted on changed status. */
  status: boolean;
  /** New comments on your posts and on posts you commented on. */
  replies: boolean;
  /** New changelog entries. Opt-in. */
  changelog: boolean;
  /** Daily digest of new posts. Admins only. */
  digest: boolean;
};
/** What /notifications shows and edits. */
export type EmailSettings = {
  /** Email is set up on this portal (`npx feedbax add email`). */
  enabled: boolean;
  /** Where email goes. Null when this account has no address Feedbax can use. */
  address: string | null;
  admin: boolean;
  prefs: EmailPrefs;
};
