import { createFileRoute } from "@tanstack/react-router";

import { SignInOptions } from "@/components/portal/sign-in-options";
import { pageTitle } from "@/components/portal/route-head";
import { safeRelativePath } from "@/components/portal/safe-path";
import { useViewer } from "@/components/portal/viewer";

export const Route = createFileRoute("/_portal/login")({
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
      <SignInOptions config={config} to={to} />
    </div>
  );
}
