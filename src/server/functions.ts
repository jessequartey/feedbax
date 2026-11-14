import { createServerFn } from "@tanstack/react-start";
import { getRequest, getRequestHeaders, setResponseHeader } from "@tanstack/react-start/server";
import config from "../../feedbax.config.ts";
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
import { publicConfig, viewerUser } from "./auth.ts";
import { createPostForUser, getPostDetail, listPostPage } from "./posts.ts";
import { addCommentForUser, listCommentPage } from "./comments.ts";
import { setVoteForUser } from "./votes.ts";
import { result } from "./errors.ts";
import { category, listInput, record, text, uuid } from "./validation.ts";

// One session lookup per HTTP request: during SSR the root loader and the page loaders all
// run inside the same Start request, so they share the first lookup's result.
const viewers = new WeakMap<Request, ReturnType<typeof viewerUser>>();
function viewer() {
  setResponseHeader("Cache-Control", "private, no-store");
  const request = getRequest();
  let found = viewers.get(request);
  if (!found) {
    found = viewerUser(new Headers(getRequestHeaders()));
    viewers.set(request, found);
    // Never keep a failed lookup: a retry inside the same request must try again.
    found.catch(() => viewers.delete(request));
  }
  return found;
}
export const getViewer = createServerFn({ method: "GET" }).handler(async (): Promise<Viewer> => ({
  user: await viewer(),
  config: publicConfig(config),
}));
export const listPosts = createServerFn({ method: "GET" })
  .validator((data: ListPostsInput) => listInput(data))
  .handler(async ({ data }): Promise<Page<PostSummary>> => listPostPage(data, await viewer()));
export const listMyPosts = createServerFn({ method: "GET" })
  .validator((data: ListPostsInput) => listInput(data))
  .handler(async ({ data }): Promise<Page<PostSummary>> =>
    listPostPage(data, await viewer(), true),
  );
export const getPost = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => ({ id: uuid(record(data).id) }))
  .handler(async ({ data }): Promise<PostDetail> => getPostDetail(data.id, await viewer()));
export const listComments = createServerFn({ method: "GET" })
  .validator((data: { postId: string; page?: number }) => data)
  .handler(async ({ data }): Promise<Page<CommentView>> => {
    // Comments do not depend on the viewer, so no session lookup; keep the same cache policy.
    setResponseHeader("Cache-Control", "private, no-store");
    return listCommentPage(data);
  });
export const getRoadmap = createServerFn({ method: "GET" })
  .validator((data: { q?: string; category?: Category }) => {
    const raw = record(data);
    return {
      ...(raw.q === undefined ? {} : { q: text(raw.q, 100, "q", 0) }),
      ...(raw.category === undefined ? {} : { category: category(raw.category) }),
    };
  })
  .handler(async ({ data }): Promise<RoadmapResult> => {
    const user = await viewer();
    const columns = await Promise.all(
      (["planned", "in_progress", "done"] as const).map(async (status) => {
        const page = await listPostPage({ ...data, status, sort: "trending", limit: 20 }, user);
        return { items: page.items, total: page.total };
      }),
    );
    return { planned: columns[0], in_progress: columns[1], done: columns[2] };
  });
// Mutation inputs are checked inside the result boundary, so invalid input returns
// the frozen ApiResult shape instead of escaping through Start's validator handler.
export const createPost = createServerFn({ method: "POST" })
  .validator((data: FormData) => data)
  .handler(async ({ data }): Promise<ApiResult<CreatePostResult>> =>
    result(async () => (await createPostForUser(data, await viewer())).data),
  );
export const addComment = createServerFn({ method: "POST" })
  .validator((data: { id: string; postId: string; body: string }) => data)
  .handler(async ({ data }): Promise<ApiResult<CommentView>> =>
    result(async () => addCommentForUser(data, await viewer())),
  );
export const setVote = createServerFn({ method: "POST" })
  .validator((data: { postId: string; voted: boolean }) => data)
  .handler(async ({ data }): Promise<ApiResult<VoteResult>> =>
    result(async () => setVoteForUser(data, await viewer())),
  );
