import type {
  ChangelogModule,
  ChangelogPage,
  ChangelogQuery,
} from "@feedbax/changelog";

export function loadPublicChangelogPage({
  changelog,
  query = {},
}: {
  changelog: Pick<ChangelogModule, "listPublishedEntries">;
  query?: ChangelogQuery;
}): Promise<ChangelogPage> {
  return changelog.listPublishedEntries(query);
}
