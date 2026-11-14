import { env } from "cloudflare:workers";
import type { PublicConfig } from "../contracts/config.ts";
import { publicConfig } from "./auth.ts";
import { effectiveSettings, runtimeConfig } from "./settings.ts";

/**
 * What the portal shows every visitor: feedbax.config.ts with the admin's runtime overrides
 * (header name, anonymous switch, offered categories) applied. Backed by the per-isolate
 * settings cache, so it costs no D1 read on most requests.
 */
export async function portalConfig(): Promise<PublicConfig> {
  const [runtime, settings] = await Promise.all([runtimeConfig(), effectiveSettings()]);
  return publicConfig(runtime, env, settings.categories);
}
