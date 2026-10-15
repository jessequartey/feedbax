import { assertRuntimeBindings, type FeedbaxConfig } from "@feedbax/config";
import {
  createGitHubFeedbackModule,
  createGitHubServiceAccess,
  createNotionFeedbackModule,
  type ConnectedDatabase,
  type VerifiedParticipant,
  createPostOwnership,
} from "@feedbax/feedback";

export function createContentFeedbackModule(
  config: FeedbaxConfig,
  environment: {
    FEEDBAX_DB?: ConnectedDatabase;
    NOTION_TOKEN?: string;
    GITHUB_SERVICE_SECRET?: string;
    getGitHubServiceSecret?: () => Promise<string>;
  },
  request: typeof fetch = fetch,
  participant?: VerifiedParticipant,
) {
  assertRuntimeBindings(config, environment);
  const features = {
    votingEnabled: config.features.voting,
    commentsEnabled: config.features.comments,
    ...(config.connected && participant && environment.FEEDBAX_DB
      ? { ownership: createPostOwnership(environment.FEEDBAX_DB, participant) }
      : {}),
  };
  if (config.provider === "github") {
    if (
      !environment.getGitHubServiceSecret &&
      (!environment.GITHUB_SERVICE_SECRET ||
        environment.GITHUB_SERVICE_SECRET.length < 32)
    )
      throw new Error(
        "GitHub requires GITHUB_SERVICE_SECRET. Pair this portal with the GitHub App service.",
      );
    return createGitHubFeedbackModule({
      ...features,
      ...config.github,
      database: environment.FEEDBAX_DB!,
      request,
      getToken: createGitHubServiceAccess({
        config: config.github,
        secret: environment.GITHUB_SERVICE_SECRET,
        getSecret: environment.getGitHubServiceSecret,
        request,
      }),
    });
  }
  if (!environment.NOTION_TOKEN)
    throw new Error("Notion requires NOTION_TOKEN.");
  return createNotionFeedbackModule({
    ...features,
    token: environment.NOTION_TOKEN,
    dataSourceId: config.notion.dataSourceId,
    propertyIds: config.notion.properties,
    request,
  });
}
