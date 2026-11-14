import config from "../../feedbax.config.ts";
import type { AdminSettings } from "../contracts/admin.ts";
import type { ViewerUser } from "../contracts/domain.ts";
import { requireAdmin } from "./auth.ts";
import {
  deleteComment,
  deletePost,
  listModerationComments,
  listModerationPosts,
  mergePost,
  searchMergeTargets,
  sendToGitHub,
  setPostState,
} from "./moderation.ts";
import { readSettings, resolveSettings, saveSettings } from "./settings.ts";
import type { SettingsPatch } from "./settings.ts";
import { invalid } from "./errors.ts";
import { listUsers, setAdminRole, setBanned } from "./user-admin.ts";
import { record } from "./validation.ts";

// The one entry point for every admin server function (functions.ts calls `adminApi.<name>`).
// `admin()` makes the guard impossible to forget: no handler runs before requireAdmin has
// accepted the viewer, and the viewer comes from the session on the server, never the client.

type Admin = ViewerUser & { admin: true };
function admin<I, O>(handler: (admin: Admin, input: I) => Promise<O>) {
  return async (viewer: ViewerUser | null, input: I): Promise<O> =>
    handler(requireAdmin(viewer), input);
}

async function adminSettings(): Promise<AdminSettings> {
  return { effective: await readSettings(), defaults: resolveSettings(config, []) };
}

export const adminApi = {
  /** The layout's gate: succeeds only for an admin. */
  session: admin(async (who: Admin) => ({ name: who.name })),
  listModerationPosts: admin((_who, input: unknown) => listModerationPosts(input)),
  listModerationComments: admin((_who, input: unknown) => listModerationComments(input)),
  setPostState: admin((_who, input: unknown) => setPostState(input)),
  mergePost: admin((_who, input: unknown) => mergePost(input)),
  searchMergeTargets: admin((_who, input: unknown) => searchMergeTargets(input)),
  deletePost: admin((_who, input: unknown) => deletePost(input)),
  deleteComment: admin((_who, input: unknown) => deleteComment(input)),
  sendToGitHub: admin((_who, input: unknown) => sendToGitHub(input)),
  listUsers: admin((who, input: unknown) => listUsers(input, who)),
  setBanned: admin((who, input: unknown) => setBanned(input, who)),
  setAdminRole: admin((who, input: unknown) => setAdminRole(input, who)),
  getSettings: admin(() => adminSettings()),
  saveSettings: admin(async (_who, input: unknown) => {
    const data = record(input);
    // Only the safe fields; saveSettings rejects anything else and any invalid value.
    for (const key of Object.keys(data))
      if (!["name", "anonymous", "categories", "notifications"].includes(key)) invalid(key);
    await saveSettings(data as SettingsPatch);
    return adminSettings();
  }),
};
export type AdminApi = typeof adminApi;
