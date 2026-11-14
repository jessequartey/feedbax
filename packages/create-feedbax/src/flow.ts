import type {
  GitHubSetupClient,
  NotionSetupClient,
  NotionTarget,
} from "../../../src/contracts/integrations.ts";
import type { IntegrationError } from "../../../src/contracts/integrations.ts";
import { Cancelled, CliError, pageProblem, repoProblem, tokenProblem } from "./flags.ts";
import type { Flags } from "./flags.ts";
import { GITHUB_TOKEN_URL, NOTION_INTEGRATION_URL, NOTION_TEMPLATE_URL } from "./links.ts";
import type { Clients, Prompter, Secrets } from "./types.ts";
export async function validatedToken(
  provider: "notion" | "github",
  initial: string | undefined,
  clients: Clients,
  prompt: Prompter,
  yes: boolean,
): Promise<{ token: string; client: NotionSetupClient | GitHubSetupClient }> {
  let token = initial;
  while (true) {
    if (!token) {
      if (yes)
        throw new CliError(`Set ${provider === "notion" ? "NOTION_TOKEN" : "GITHUB_TOKEN"}.`, 2);
      token = await prompt.text(
        provider === "notion" ? "Paste your Notion secret" : "Paste a GitHub token",
        { secret: true, validate: tokenProblem },
      );
    }
    const problem = tokenProblem(token);
    if (problem) throw new CliError(problem, 2);
    const client = provider === "notion" ? clients.notion(token) : clients.github(token);
    try {
      await client.me();
      return { token, client };
    } catch (error) {
      if (error instanceof Cancelled || (error instanceof Error && error.name === "AbortError"))
        throw new Cancelled();
      const details = error as Partial<IntegrationError> | null;
      const auth =
        details?.provider === provider &&
        (details.kind === "auth" || details.kind === "permission");
      const message = auth
        ? provider === "notion"
          ? "Notion could not accept that secret: check you copied the whole secret from Internal Integration Secret."
          : "GitHub could not accept that token. Check it has not expired and has access to your selected repository."
        : `Could not reach ${provider === "notion" ? "Notion" : "GitHub"}. Check your connection and try again.`;
      if (yes) throw new CliError(message);
      prompt.error(message);
      if (auth) token = undefined;
      else if (!(await prompt.confirm("Try again?", true)))
        throw new CliError("Connection check stopped.");
    }
  }
}
export async function chooseNotion(
  client: NotionSetupClient,
  flags: Flags,
  prompt: Prompter,
  onRemote: () => void,
  savedId?: string,
): Promise<NotionTarget> {
  while (true) {
    const targets = await client.findFeedbaxDataSources();
    const saved = savedId
      ? targets.find(
          (target) => target.dataSourceId.replaceAll("-", "") === savedId.replaceAll("-", ""),
        )
      : undefined;
    if (savedId && !saved)
      throw new CliError(
        "The saved Notion database is no longer accessible or its columns changed. Restore the integration's Content access and the required Feedbax columns, then retry.",
      );
    if (saved || targets.length === 1) {
      const target = saved ?? targets[0]!;
      if (saved && flags.notionPage) {
        if (!saved.parentPageId)
          throw new CliError(
            "The saved Notion parent cannot be verified. Resume without --notion-page to keep the saved database unchanged.",
            2,
          );
        const page = await client.getPage(flags.notionPage);
        if (
          page.id.replaceAll("-", "").toLowerCase() !==
          saved.parentPageId.replaceAll("-", "").toLowerCase()
        )
          throw new CliError(
            "--notion-page names a different parent from the saved database. Resume without that flag, or explicitly edit feedbax.config.ts to change targets.",
            2,
          );
      }
      if (target.needsRepair)
        prompt.info("Updating missing Feedbax columns in the selected database.");
      await client.prepareDataSource(target);
      prompt.info(`Using Feedbax in ${target.parentTitle}`);
      return target;
    }
    if (targets.length > 1 && !flags.yes) {
      const id = await prompt.select(
        "Which Feedbax database?",
        targets.map((target) => ({
          value: target.dataSourceId,
          label: target.parentTitle,
          hint: target.needsRepair
            ? `${target.url} · missing columns will be added after selection`
            : target.url,
        })),
      );
      const target = targets.find((target) => target.dataSourceId === id)!;
      if (target.needsRepair)
        prompt.info("Updating missing Feedbax columns in the selected database.");
      await client.prepareDataSource(target);
      return target;
    }
    if (flags.yes && !flags.notionPage)
      throw new CliError(
        "No unique Feedbax database was found. Set --notion-page to a page shared in the integration's Content access tab.",
        2,
      );
    let page = flags.notionPage;
    if (!page) {
      const pages = await client.listPages();
      const picked = await prompt.select("Where should Feedbax create its database?", [
        ...pages.map((p) => ({ value: p.id, label: p.title || "Untitled", hint: p.url })),
        { value: "paste", label: "Paste a page link" },
        { value: "search", label: "I just shared one — search again" },
      ]);
      if (picked === "search") continue;
      page =
        picked === "paste"
          ? await prompt.text("Paste a Notion page link", { validate: pageProblem })
          : picked;
    }
    try {
      const selected = await client.getPage(page);
      onRemote();
      return await client.createDatabase(selected.id);
    } catch (error) {
      if (error instanceof Cancelled || (error instanceof Error && error.name === "AbortError"))
        throw new Cancelled();
      const message =
        "Notion could not use that page. In your integration's Content access tab → Edit access, add the page and allow reading, inserting and updating content.";
      if (flags.yes) throw new CliError(message);
      prompt.error(message);
      if (!(await prompt.confirm("Choose a page again?", true))) throw new CliError(message);
      flags = { ...flags, notionPage: undefined };
    }
  }
}
export async function chooseRepo(
  client: GitHubSetupClient,
  flags: Flags,
  prompt: Prompter,
  savedRepo?: string,
): Promise<string> {
  let repo = flags.githubRepo ?? savedRepo;
  while (true) {
    if (!repo) {
      if (flags.yes) throw new CliError("Set --github-repo owner/repo.", 2);
      const repos = await client.listRepos();
      repo = await prompt.select("Which repository?", [
        ...repos.map((r) => ({
          value: r.fullName,
          label: r.fullName,
          hint: r.archived ? "Archived" : !r.hasIssues ? "Issues disabled" : undefined,
        })),
        { value: "paste", label: "Enter owner/repo" },
      ]);
      if (repo === "paste")
        repo = await prompt.text("Repository (owner/repo)", { validate: repoProblem });
    }
    try {
      const checked = await client.checkRepo(repo);
      if (checked.archived)
        throw new CliError(
          "This repository is archived. Unarchive it in GitHub Settings or pick another repository.",
        );
      if (!checked.hasIssues)
        throw new CliError(
          "Issues are disabled. Enable Issues in the repository's Settings → General → Features.",
        );
      prompt.info("Issues: write access verified");
      return checked.fullName;
    } catch (error) {
      if (error instanceof Cancelled || (error instanceof Error && error.name === "AbortError"))
        throw new Cancelled();
      const message =
        error instanceof CliError || (error instanceof Error && error.name === "IntegrationError")
          ? error.message
          : "Cannot reach this repository. Give the token access to it and choose Issues: Read and write.";
      if (flags.yes) throw new CliError(message);
      prompt.error(message);
      repo = undefined;
    }
  }
}
export function notionGuide(prompt: Prompter): void {
  prompt.note(
    `1. Duplicate the Feedbax template (optional):\n   ${NOTION_TEMPLATE_URL}\n2. Create an integration: ${NOTION_INTEGRATION_URL}\n   New integration → Internal → copy Internal Integration Secret (ntn_…).\n   You need to be a workspace owner.\n3. Content access → Edit access → add the Feedbax page\n   (or the page where Feedbax should create its database).`,
    "Connect Notion",
  );
}
export function githubGuide(prompt: Prompter): void {
  prompt.note(
    `${GITHUB_TOKEN_URL}\nChoose Only select repositories, select one repository,\nthen select Issues: Read and write. Copy the fine-grained token.`,
    "Connect GitHub",
  );
}
export function secretValues(secrets: Secrets): string[] {
  return Object.values(secrets).filter((value): value is string => Boolean(value));
}
