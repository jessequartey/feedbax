export type FetchFn = typeof fetch;
export type NotionTarget = {
  dataSourceId: string;
  databaseId: string;
  parentTitle: string;
  url: string;
  needsRepair?: boolean;
  parentPageId?: string;
};
export type NotionPageChoice = { id: string; title: string; url: string };
export type GitHubRepo = { fullName: string; archived: boolean; hasIssues: boolean };
export type IntegrationErrorKind =
  | "auth"
  | "permission"
  | "not_found"
  | "schema"
  | "rate_limit"
  | "transient";
export class IntegrationError extends Error {
  readonly provider: "notion" | "github";
  readonly kind: IntegrationErrorKind;
  readonly status: number | null;
  readonly retryAfterMs: number | null;
  constructor(
    provider: "notion" | "github",
    kind: IntegrationErrorKind,
    status: number | null,
    retryAfterMs: number | null,
    message: string,
  ) {
    super(message);
    this.name = "IntegrationError";
    this.provider = provider;
    this.kind = kind;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}
export type NotionTemplateOptions = {
  /** Fill the given page (it must be empty) instead of creating a child page under it. */
  fillPage?: boolean;
  /** Insert four example rows (no Feedbax ID, so sync ignores them). */
  examples?: boolean;
};
export type NotionTemplateResult = {
  pageUrl: string;
  target: NotionTarget;
  /** Whether the database views were created through the API. Absent means "not attempted". */
  views?: { created: boolean; error?: string };
};
export type NotionSetupClient = {
  me(): Promise<{ name: string | null }>;
  findFeedbaxDataSources(): Promise<NotionTarget[]>; // search data_source + schema match, all pages
  prepareDataSource(target: NotionTarget): Promise<void>; // repair only the selected/saved target
  listPages(): Promise<NotionPageChoice[]>; // search pages, ≤100, excludes in_trash
  getPage(idOrUrl: string): Promise<NotionPageChoice>; // parses notion.so / notion.site / UUID
  createDatabase(pageId: string): Promise<NotionTarget>;
  createTemplatePage(
    pageId: string,
    options?: NotionTemplateOptions,
  ): Promise<NotionTemplateResult>;
};
export type GitHubSetupClient = {
  me(): Promise<{ login: string }>;
  listRepos(): Promise<GitHubRepo[]>; // first 100 the token can see
  checkRepo(fullName: string): Promise<GitHubRepo>; // + verifies issues write access (invalid-body POST: 422 = can write)
};
