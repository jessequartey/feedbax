import type { ChangelogPage } from "@feedbax/changelog";
import { queryOptions } from "@tanstack/react-query";

export type FetchChangelogPage = (input?: {
  data?: { cursor?: string; label?: string };
}) => Promise<ChangelogPage>;

export function changelogQuery(fetchPage: FetchChangelogPage) {
  return queryOptions({
    queryKey: ["public-changelog"],
    queryFn: () => fetchPage(),
  });
}
