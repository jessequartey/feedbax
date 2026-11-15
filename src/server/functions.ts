import { createServerFn } from "@tanstack/react-start";
import { getRequest, getRequestHeaders, setResponseHeader } from "@tanstack/react-start/server";
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
import type { ChangelogEntry, ChangelogPage } from "../contracts/changelog.ts";
import type { Viewer } from "../contracts/portal.ts";
import { viewerUser } from "./auth.ts";
import { adminApi } from "./admin-api.ts";
import { getPublishedEntry, listPublishedEntries } from "./changelog.ts";
import { portalConfig } from "./portal-config.ts";
import { createPostForUser, getPostDetail, listPostPage } from "./posts.ts";
import { addCommentForUser, listCommentPage } from "./comments.ts";
import { setVoteForUser } from "./votes.ts";
import { result } from "./errors.ts";
import type { EmailSettings } from "../contracts/portal.ts";
import { getEmailSettings, saveEmailPrefs, unsubscribeWithLink } from "../email/prefs.ts";
import type { EmailKind } from "../email/unsubscribe.ts";
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
  // The admin's runtime overrides (name, anonymous, categories) take effect here.
  config: await portalConfig(),
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
    // The viewer is looked up only for a hidden post, whose comments its author may read.
    return listCommentPage(data, viewer);
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
// The changelog is public and the same for everyone, so there is no session lookup.
export const getChangelog = createServerFn({ method: "GET" })
  .validator((data: { page?: number }) => data)
  .handler(async ({ data }): Promise<ChangelogPage> => {
    setResponseHeader("Cache-Control", "private, no-store");
    return listPublishedEntries(data);
  });
export const getChangelogEntry = createServerFn({ method: "GET" })
  .validator((data: { id: string }) => ({ id: record(data).id }))
  .handler(async ({ data }): Promise<ChangelogEntry> => {
    setResponseHeader("Cache-Control", "private, no-store");
    return getPublishedEntry(data.id);
  });
// Mutation inputs are checked inside the result boundary, so invalid input returns
// the frozen ApiResult shape instead of escaping through Start's validator handler.
export const createPost = createServerFn({ method: "POST" })
  .validator((data: FormData) => data)
  .handler(async ({ data }): Promise<ApiResult<CreatePostResult>> =>
    result(async () => (await createPostForUser(data, await viewer())).data, "posts.create"),
  );
export const addComment = createServerFn({ method: "POST" })
  .validator((data: { id: string; postId: string; body: string }) => data)
  .handler(async ({ data }): Promise<ApiResult<CommentView>> =>
    result(async () => addCommentForUser(data, await viewer()), "comments.create"),
  );
export const setVote = createServerFn({ method: "POST" })
  .validator((data: { postId: string; voted: boolean }) => data)
  .handler(async ({ data }): Promise<ApiResult<VoteResult>> =>
    result(async () => setVoteForUser(data, await viewer()), "votes.set"),
  );

// ---- Email notifications (/notifications, /unsubscribe) ----
export const getEmailPreferences = createServerFn({ method: "GET" }).handler(
  async (): Promise<ApiResult<EmailSettings>> =>
    result(async () => getEmailSettings(await viewer()), "email.prefs"),
);
export const saveEmailPreferences = createServerFn({ method: "POST" })
  .validator(
    (data: Partial<Record<EmailKind, boolean>>) => data as Partial<Record<EmailKind, boolean>>,
  )
  .handler(async ({ data }): Promise<ApiResult<EmailSettings>> =>
    result(async () => saveEmailPrefs(data, await viewer()), "email.prefs"),
  );
/** The footer link's page posts here. Signed links need no session. */
export const unsubscribeEmail = createServerFn({ method: "POST" })
  .validator((data: { u?: string; k?: string; t?: string }) => record(data))
  .handler(async ({ data }): Promise<ApiResult<{ kind: EmailKind }>> =>
    result(async () => unsubscribeWithLink(data), "email.prefs"),
  );

// ---- Admin (/admin/*) ----
// Every function runs the admin guard on the server through `adminApi` (admin-api.ts), which
// checks `requireAdmin` before anything else. Reads are GET, changes are POST (same-origin).
// Results use the ApiResult shape so a non-admin gets a plain "forbidden", never a hint.
const pass = <T>(data: T) => data;
export const adminSession = createServerFn({ method: "GET" }).handler(async () =>
  result(async () => adminApi.session(await viewer(), undefined), "admin.action"),
);
export const adminListPosts = createServerFn({ method: "GET" })
  .validator(pass<{ filter?: string; page?: number }>)
  .handler(async ({ data }) =>
    result(async () => adminApi.listModerationPosts(await viewer(), data), "admin.action"),
  );
export const adminListComments = createServerFn({ method: "GET" })
  .validator(pass<{ page?: number }>)
  .handler(async ({ data }) =>
    result(async () => adminApi.listModerationComments(await viewer(), data), "admin.action"),
  );
export const adminSetPostState = createServerFn({ method: "POST" })
  .validator(pass<{ postId: string; state: string }>)
  .handler(async ({ data }) =>
    result(async () => adminApi.setPostState(await viewer(), data), "admin.action"),
  );
export const adminMergePost = createServerFn({ method: "POST" })
  .validator(pass<{ sourceId: string; targetId: string }>)
  .handler(async ({ data }) =>
    result(async () => adminApi.mergePost(await viewer(), data), "admin.action"),
  );
export const adminSearchMergeTargets = createServerFn({ method: "GET" })
  .validator(pass<{ excludeId: string; q?: string }>)
  .handler(async ({ data }) =>
    result(async () => adminApi.searchMergeTargets(await viewer(), data), "admin.action"),
  );
export const adminDeletePost = createServerFn({ method: "POST" })
  .validator(pass<{ postId: string }>)
  .handler(async ({ data }) =>
    result(async () => adminApi.deletePost(await viewer(), data), "admin.action"),
  );
export const adminDeleteComment = createServerFn({ method: "POST" })
  .validator(pass<{ commentId: string }>)
  .handler(async ({ data }) =>
    result(async () => adminApi.deleteComment(await viewer(), data), "admin.action"),
  );
export const adminSendToGitHub = createServerFn({ method: "POST" })
  .validator(pass<{ postId: string }>)
  .handler(async ({ data }) =>
    result(async () => adminApi.sendToGitHub(await viewer(), data), "admin.action"),
  );
export const adminListUsers = createServerFn({ method: "GET" })
  .validator(pass<{ q?: string; filter?: string; page?: number }>)
  .handler(async ({ data }) =>
    result(async () => adminApi.listUsers(await viewer(), data), "admin.action"),
  );
export const adminSetBanned = createServerFn({ method: "POST" })
  .validator(pass<{ userId: string; banned: boolean }>)
  .handler(async ({ data }) =>
    result(async () => adminApi.setBanned(await viewer(), data), "admin.action"),
  );
export const adminSetAdminRole = createServerFn({ method: "POST" })
  .validator(pass<{ userId: string; admin: boolean }>)
  .handler(async ({ data }) =>
    result(async () => adminApi.setAdminRole(await viewer(), data), "admin.action"),
  );
export const adminChangelogList = createServerFn({ method: "GET" })
  .validator(pass<{ page?: number }>)
  .handler(async ({ data }) =>
    result(async () => adminApi.changelogList(await viewer(), data), "admin.action"),
  );
export const adminChangelogCreate = createServerFn({ method: "POST" })
  .validator(pass<{ title: string; body: string; postIds?: string[] }>)
  .handler(async ({ data }) =>
    result(async () => adminApi.changelogCreate(await viewer(), data), "admin.action"),
  );
export const adminChangelogUpdate = createServerFn({ method: "POST" })
  .validator(pass<{ id: string; title: string; body: string; postIds?: string[] }>)
  .handler(async ({ data }) =>
    result(async () => adminApi.changelogUpdate(await viewer(), data), "admin.action"),
  );
export const adminChangelogDelete = createServerFn({ method: "POST" })
  .validator(pass<{ id: string }>)
  .handler(async ({ data }) =>
    result(async () => adminApi.changelogDelete(await viewer(), data), "admin.action"),
  );
export const adminChangelogSetStatus = createServerFn({ method: "POST" })
  .validator(pass<{ id: string; published: boolean }>)
  .handler(async ({ data }) =>
    result(async () => adminApi.changelogSetStatus(await viewer(), data), "admin.action"),
  );
export const adminChangelogSearchPosts = createServerFn({ method: "GET" })
  .validator(pass<{ q?: string }>)
  .handler(async ({ data }) =>
    result(async () => adminApi.changelogSearchPosts(await viewer(), data), "admin.action"),
  );
export const adminWebhooksList = createServerFn({ method: "GET" }).handler(async () =>
  result(async () => adminApi.webhooksList(await viewer(), undefined), "admin.action"),
);
export const adminWebhookCreate = createServerFn({ method: "POST" })
  .validator(pass<Record<string, unknown>>)
  .handler(async ({ data }) =>
    result(async () => adminApi.webhookCreate(await viewer(), data), "admin.action"),
  );
export const adminWebhookUpdate = createServerFn({ method: "POST" })
  .validator(pass<Record<string, unknown>>)
  .handler(async ({ data }) =>
    result(async () => adminApi.webhookUpdate(await viewer(), data), "admin.action"),
  );
export const adminWebhookDelete = createServerFn({ method: "POST" })
  .validator(pass<{ id: string }>)
  .handler(async ({ data }) =>
    result(async () => adminApi.webhookDelete(await viewer(), data), "admin.action"),
  );
// A POST, so the secret never sits in a cacheable GET response.
export const adminWebhookRevealSecret = createServerFn({ method: "POST" })
  .validator(pass<{ id: string }>)
  .handler(async ({ data }) =>
    result(async () => adminApi.webhookRevealSecret(await viewer(), data), "admin.action"),
  );
export const adminWebhookRotateSecret = createServerFn({ method: "POST" })
  .validator(pass<{ id: string }>)
  .handler(async ({ data }) =>
    result(async () => adminApi.webhookRotateSecret(await viewer(), data), "admin.action"),
  );
export const adminWebhookTest = createServerFn({ method: "POST" })
  .validator(pass<{ id: string }>)
  .handler(async ({ data }) =>
    result(async () => adminApi.webhookTest(await viewer(), data), "admin.action"),
  );
export const adminGetSettings = createServerFn({ method: "GET" }).handler(async () =>
  result(async () => adminApi.getSettings(await viewer(), undefined), "admin.action"),
);
export const adminSaveSettings = createServerFn({ method: "POST" })
  .validator(pass<Record<string, unknown>>)
  .handler(async ({ data }) =>
    result(async () => adminApi.saveSettings(await viewer(), data), "admin.action"),
  );
