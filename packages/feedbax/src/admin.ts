import { CliError } from "../../create-feedbax/src/flags.ts";
import { ADMIN_LINK_TTL_SECONDS, mintAdminLink } from "../../../src/server/admin-link.ts";
import { isDeployedUrl, loadProject, portalUrl, type Context } from "./context.ts";

/** Print a 15-minute, single-use admin sign-in link for the deployed portal. */
export async function admin(ctx: Context): Promise<number> {
  const project = await loadProject(ctx);
  if (!project.hasDevVars)
    ctx.prompt.error(
      ".dev.vars is missing. It holds BETTER_AUTH_SECRET, the key that signs admin links; restore it from your backup (create-feedbax wrote it at setup).",
    );
  const secret = project.vars.BETTER_AUTH_SECRET || ctx.env.BETTER_AUTH_SECRET;
  if (!secret)
    throw new CliError(
      "BETTER_AUTH_SECRET was not found in .dev.vars or the environment. Admin links are signed with your portal's deployed BETTER_AUTH_SECRET.",
      2,
    );
  const portal = portalUrl(project);
  if (!portal) throw new CliError("wrangler.jsonc has no vars.PORTAL_URL.", 2);
  if (!isDeployedUrl(portal))
    ctx.prompt.info(`PORTAL_URL is ${portal}; this link only works on that local server.`);
  let link;
  try {
    link = await mintAdminLink({ secret, portalUrl: portal });
  } catch {
    throw new CliError("BETTER_AUTH_SECRET in .dev.vars is not a valid secret.", 2);
  }
  ctx.prompt.info(
    `Admin sign-in link for ${portal}. It works once and expires in ${ADMIN_LINK_TTL_SECONDS / 60} minutes (${new Date(link.expiresAt * 1000).toISOString()}). Don't share it.`,
  );
  ctx.log(link.url);
  return 0;
}
