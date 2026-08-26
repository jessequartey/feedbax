import { createFileRoute, notFound } from "@tanstack/react-router";
import type { PortalFeatures } from "@feedbax/config";
import { useSuspenseQuery } from "@tanstack/react-query";

import { ChangelogPage } from "../changelog-page";
import { changelogQuery } from "../changelog-query";
import feedbax from "../feedbax";
import { getPublicChangelogPage } from "../public-changelog-server-function";

export function ensureChangelogEnabled(features: PortalFeatures) {
  if (!features.changelog) throw notFound();
}

const query = changelogQuery(getPublicChangelogPage);

export const Route = createFileRoute("/changelog")({
  beforeLoad: () => {
    ensureChangelogEnabled(feedbax.features);
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(query),
  component: ChangelogRoute,
});

function ChangelogRoute() {
  const initialPage = useSuspenseQuery(query).data;
  return (
    <ChangelogPage
      initialPage={initialPage}
      loadPage={(data) => getPublicChangelogPage({ data })}
    />
  );
}
