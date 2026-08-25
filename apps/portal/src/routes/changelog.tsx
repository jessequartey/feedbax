import { createFileRoute, notFound } from "@tanstack/react-router";
import type { PortalFeatures } from "@feedbax/config";

import { ChangelogPage } from "../changelog-page";
import feedbax from "../feedbax";

export function ensureChangelogEnabled(features: PortalFeatures) {
  if (!features.changelog) throw notFound();
}

export const Route = createFileRoute("/changelog")({
  beforeLoad: () => {
    ensureChangelogEnabled(feedbax.features);
  },
  component: ChangelogPage,
});
