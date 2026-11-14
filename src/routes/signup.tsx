import { createFileRoute, redirect } from "@tanstack/react-router";
import { safeRelativePath } from "@/components/portal/safe-path";

export const Route = createFileRoute("/signup")({
  validateSearch: (search: Record<string, unknown>): { to?: string } => {
    const to = safeRelativePath(search.to);
    return to === "/" ? {} : { to };
  },
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/login", search });
  },
});
