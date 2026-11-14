import { appUrlProblem, CliError, tokenProblem } from "./flags.ts";
import type { Prompter, Secrets, SetupAnswers } from "./types.ts";
export const oauthFields = {
  github: ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"],
  google: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
} as const;
const secretFields = {
  github: ["githubClientId", "githubClientSecret"],
  google: ["googleClientId", "googleClientSecret"],
} as const;
// A source owns the whole pair. Even a complete override cannot hide a broken saved pair.
export function oauthSecrets(
  env: Record<string, string | undefined>,
  saved: Record<string, string>,
): Partial<Secrets> {
  const result: Partial<Secrets> = {};
  for (const provider of ["github", "google"] as const) {
    const [id, secret] = oauthFields[provider];
    for (const source of [env, saved]) {
      if (!source[id] && !source[secret]) continue;
      if (
        !source[id] ||
        !source[secret] ||
        tokenProblem(source[id]) ||
        tokenProblem(source[secret])
      )
        throw new CliError(
          `Set both ${id} and ${secret}, without whitespace, or remove both. A new half-pair cannot use a saved half. Run interactively to receive the exact callback and OAuth App setup fields.`,
          2,
        );
    }
    const source = env[id] || env[secret] ? env : saved;
    const [idField, secretField] = secretFields[provider];
    if (source[id]) {
      result[idField] = source[id];
      result[secretField] = source[secret];
    }
  }
  return result;
}
export function inferredLogin(
  secrets: Partial<Secrets>,
  appUrl?: string,
): SetupAnswers["login"] | undefined {
  return secrets.githubClientId
    ? "github"
    : secrets.googleClientId
      ? "google"
      : appUrl
        ? "host"
        : undefined;
}
export function requireLogin(
  answers: Pick<SetupAnswers, "login" | "appUrl">,
  secrets: Partial<Secrets>,
): void {
  if (answers.appUrl && appUrlProblem(answers.appUrl))
    throw new CliError(appUrlProblem(answers.appUrl)!, 2);
  if (answers.login === "host") {
    if (!answers.appUrl)
      throw new CliError("Host login needs --app-url (or appUrl saved in feedbax.config.ts).", 2);
    const url = new URL(answers.appUrl);
    if (url.protocol !== "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
      throw new CliError(
        "Deployed host login needs your real HTTPS --app-url. Localhost is for development only.",
        2,
      );
  } else if (!secrets[secretFields[answers.login][0]] || !secrets[secretFields[answers.login][1]]) {
    throw new CliError(
      `Non-interactive setup needs ${oauthFields[answers.login].join(" and ")}. Run interactively to receive the exact callback and OAuth App setup fields.`,
      2,
    );
  }
}
export async function loginCheckpoint(
  answers: SetupAnswers,
  secrets: Secrets,
  portal: string,
  prompt: Prompter,
  yes: boolean,
  onSecret: (value: string) => void,
  persist: () => Promise<void>,
): Promise<void> {
  if (answers.login === "host") {
    requireLogin(answers, secrets);
    return;
  }
  const provider = answers.login;
  const callback = `${portal}/api/auth/callback/${provider}`;
  prompt.note(
    provider === "github"
      ? `Create an OAuth App at https://github.com/settings/applications/new.\nHomepage URL: ${portal}\nAuthorization callback URL: ${callback}\nThis is not the Issues token.`
      : `Create a Web application OAuth client at https://console.cloud.google.com/apis/credentials.\nAuthorized JavaScript origin: ${portal}\nAuthorized redirect URI: ${callback}\nConfigure the consent screen and test users while in Testing; publishing and verification requirements depend on your Google audience and scopes.`,
    `${provider === "github" ? "GitHub" : "Google"} sign-in setup`,
  );
  const [id, secret] = secretFields[provider];
  if (!secrets[id] && !yes) {
    const clientId = await prompt.text(
      `${provider === "github" ? "GitHub" : "Google"} OAuth client ID`,
      { validate: tokenProblem },
    );
    onSecret(clientId);
    if (tokenProblem(clientId))
      throw new CliError("OAuth client ID must be nonempty without whitespace.", 2);
    const clientSecret = await prompt.text("OAuth client secret", {
      secret: true,
      validate: tokenProblem,
    });
    onSecret(clientSecret);
    if (tokenProblem(clientSecret))
      throw new CliError("OAuth client secret must be nonempty without whitespace.", 2);
    secrets[id] = clientId;
    secrets[secret] = clientSecret;
    await persist();
  }
  requireLogin(answers, secrets);
  prompt.info(
    "Credentials configured; provider consent, callback, session and first feedback still need an end-to-end check.",
  );
}
