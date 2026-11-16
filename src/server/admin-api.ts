import { env } from "cloudflare:workers";
import { integrationConfig as config } from "./integration-config.ts";
import type { AdminSettings } from "../contracts/admin.ts";
import type { ViewerUser } from "../contracts/domain.ts";
import { requireAdmin } from "./auth.ts";
import { listSimilarGroups } from "./similar-groups.ts";
import {
  createEntry,
  deleteEntry,
  listAdminEntries,
  searchLinkablePosts,
  setChangelogStatus,
  updateEntry,
} from "./changelog.ts";
import {
  deleteComment,
  approveComment,
  deletePost,
  listModerationComments,
  listModerationPosts,
  listPostVoters,
  mergePost,
  searchMergeTargets,
  sendToGitHub,
  setPostState,
  setPostPriority,
} from "./moderation.ts";
import { readSettings, resolveSettings, saveSettings } from "./settings.ts";
import type { SettingsPatch } from "./settings.ts";
import { invalid } from "./errors.ts";
import { getInsights } from "./insights.ts";
import { listUsers, setAdminRole, setBanned } from "./user-admin.ts";
import { record } from "./validation.ts";
import {
  createWebhook,
  deleteWebhook,
  getWebhookDelivery,
  listWebhooks,
  replayWebhookDelivery,
  revealWebhookSecret,
  rotateWebhookSecret,
  testWebhook,
  updateWebhook,
} from "./webhooks.ts";

// The one entry point for every admin server function (functions.ts calls `adminApi.<name>`).
// `admin()` makes the guard impossible to forget: no handler runs before requireAdmin has
// accepted the viewer, and the viewer comes from the session on the server, never the client.

type Admin = ViewerUser & { admin: true };
function admin<I, O>(handler: (admin: Admin, input: I) => Promise<O>) {
  return async (viewer: ViewerUser | null, input: I): Promise<O> =>
    handler(requireAdmin(viewer), input);
}

async function adminSettings(): Promise<AdminSettings> {
  return {
    effective: await readSettings(),
    defaults: resolveSettings(config, []),
    githubEnabled: !!config.integrations.github && !!env.GITHUB_TOKEN?.trim(),
  };
}

export const adminApi = {
  /** The layout's gate: succeeds only for an admin. */
  session: admin(async (who: Admin) => ({ name: who.name })),
  insights: admin((_who, input?: unknown) => getInsights(input)),
  listModerationPosts: admin((_who, input: unknown) => listModerationPosts(input)),
  listModerationComments: admin((_who, input: unknown) => listModerationComments(input)),
  listPostVoters: admin((_who, input: unknown) => listPostVoters(input)),
  setPostPriority: admin((_who, input: unknown) => setPostPriority(input)),
  setPostState: admin((_who, input: unknown) => setPostState(input)),
  mergePost: admin((_who, input: unknown) => mergePost(input)),
  searchMergeTargets: admin((_who, input: unknown) => searchMergeTargets(input)),
  deletePost: admin((_who, input: unknown) => deletePost(input)),
  approveComment: admin((_who, input: unknown) => approveComment(input)),
  deleteComment: admin((_who, input: unknown) => deleteComment(input)),
  sendToGitHub: admin((_who, input: unknown) => sendToGitHub(input)),
  listUsers: admin((who, input: unknown) => listUsers(input, who)),
  setBanned: admin((who, input: unknown) => setBanned(input, who)),
  setAdminRole: admin((who, input: unknown) => setAdminRole(input, who)),
  changelogList: admin((_who, input: unknown) => listAdminEntries(input)),
  changelogCreate: admin((who, input: unknown) => createEntry(input, who.id)),
  changelogUpdate: admin((_who, input: unknown) => updateEntry(input)),
  changelogDelete: admin((_who, input: unknown) => deleteEntry(input)),
  changelogSetStatus: admin((_who, input: unknown) => setChangelogStatus(input)),
  changelogSearchPosts: admin((_who, input: unknown) => searchLinkablePosts(input)),
  webhooksList: admin((_who, input?: unknown) => listWebhooks(input)),
  webhookCreate: admin((_who, input: unknown) => createWebhook(input)),
  webhookUpdate: admin((_who, input: unknown) => updateWebhook(input)),
  webhookDelete: admin((_who, input: unknown) => deleteWebhook(input)),
  webhookRevealSecret: admin((_who, input: unknown) => revealWebhookSecret(input)),
  webhookRotateSecret: admin((_who, input: unknown) => rotateWebhookSecret(input)),
  webhookTest: admin((_who, input: unknown) => testWebhook(input)),
  webhookDelivery: admin((_who, input: unknown) => getWebhookDelivery(input)),
  webhookReplay: admin((_who, input: unknown) => replayWebhookDelivery(input)),
  getSettings: admin(() => adminSettings()),
  similarGroups: admin(() => listSimilarGroups()),
  saveSettings: admin(async (_who, input: unknown) => {
    const data = record(input);
    // Only the safe fields; saveSettings rejects anything else and any invalid value.
    for (const key of Object.keys(data))
      if (
        !["name", "anonymous", "categories", "notifications", "changelog", "moderation"].includes(
          key,
        )
      )
        invalid(key);
    await saveSettings(data as SettingsPatch);
    return adminSettings();
  }),
};
export type AdminApi = typeof adminApi;
