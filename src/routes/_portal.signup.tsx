import { createFileRoute, redirect } from "@tanstack/react-router";
import { safeRelativePath } from "@/components/portal/safe-path";

export const Route = createFileRoute("/_portal/signup")({
  validateSearch: (search: Record<string, unknown>): { to?: string } => {
    const to = safeRelativePath(search.to);
    return to === "/" ? {} : { to };
  },
  beforeLoad: ({ search }) => {
    const to = safeRelativePath(search.to);
    throw redirect({ to: "/login", search: to === "/" ? {} : { to } });
  },
});
