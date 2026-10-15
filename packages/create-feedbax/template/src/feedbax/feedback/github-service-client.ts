import type { GitHubConfiguration } from "@feedbax/config";
import { signIntegrationRequest } from "./integration-auth";

export function createGitHubServiceAccess(options: {
  config: GitHubConfiguration;
  secret?: string;
  getSecret?: () => Promise<string>;
  request?: typeof fetch;
}) {
  let cached: { token: string; expires: number; secret: string } | undefined;
  return async () => {
    const secret = options.getSecret
      ? await options.getSecret()
      : (options.secret ?? "");
    if (
      cached &&
      cached.secret === secret &&
      cached.expires > Date.now() + 60_000
    )
      return cached.token;
    const response = await (options.request ?? fetch)(
      signIntegrationRequest({
        url: `${options.config.serviceUrl}/v1/token`,
        installationId: options.config.installationId,
        secret,
        body: "{}",
      }),
    );
    if (!response.ok) {
      cached = undefined;
      throw new Error(
        "GitHub Portal Binding is unavailable. Run feedbax doctor or pair the Installation again.",
      );
    }
    const value = (await response.json()) as {
      token?: unknown;
      expiresAt?: unknown;
      repositoryId?: unknown;
      botUserId?: unknown;
    };
    const expires =
      typeof value.expiresAt === "string" ? Date.parse(value.expiresAt) : NaN;
    if (
      typeof value.token !== "string" ||
      !value.token ||
      !Number.isFinite(expires) ||
      expires <= Date.now() ||
      value.repositoryId !== options.config.repository.id ||
      value.botUserId !== options.config.botUserId
    )
      throw new Error("GitHub integration returned mismatched access.");
    // Cache only within one request factory and recheck local revocation/rotation on every use.
    cached = { token: value.token, expires, secret };
    return cached.token;
  };
}
