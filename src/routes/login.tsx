import { createFileRoute } from "@tanstack/react-router";

import { AuthForm } from "@/components/portal/auth-form";
import { pageTitle } from "@/components/portal/route-head";
import { safeRelativePath } from "@/components/portal/safe-path";
import { useViewer } from "@/components/portal/viewer";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { to?: string } => {
    const to = safeRelativePath(search.to);
    return to === "/" ? {} : { to };
  },
  head: ({ matches }) => pageTitle(matches, "Sign in"),
  component: LoginPage,
});

function LoginPage() {
  const { config } = useViewer();
  const { to } = Route.useSearch();
  return (
    <div className="px-4 py-10 md:py-16">
      <AuthForm mode="login" config={config} to={to} />
    </div>
  );
}
