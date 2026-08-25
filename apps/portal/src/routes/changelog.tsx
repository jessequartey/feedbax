import { createFileRoute } from "@tanstack/react-router";

import { ChangelogPage } from "../changelog-page";

export const Route = createFileRoute("/changelog")({
  component: ChangelogPage,
});
