import { createFileRoute } from "@tanstack/react-router";

import { AuthForm } from "@/components/portal/auth-form";
import { pageTitle } from "@/components/portal/route-head";
import { safeRelativePath } from "@/components/portal/safe-path";
import { useViewer } from "@/components/portal/viewer";

export const Route = createFileRoute("/signup")({
  validateSearch: (search: Record<string, unknown>): { to?: string } => {
    const to = safeRelativePath(search.to);
    return to === "/" ? {} : { to };
  },
  head: ({ matches }) => pageTitle(matches, "Create an account"),
  component: SignupPage,
});

function SignupPage() {
  const { config } = useViewer();
  const { to } = Route.useSearch();
  return (
    <div className="px-4 py-10 md:py-16">
      <AuthForm mode="signup" config={config} to={to} />
    </div>
  );
}
