import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_portal/admin/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/moderation", replace: true });
  },
});
