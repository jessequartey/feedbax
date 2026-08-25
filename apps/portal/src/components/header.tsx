import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@feedbax/ui/lib/utils";

import { CommandPaletteTrigger } from "./command-palette";
import { ProfileMenu } from "./profile-menu";

function Navigation({ feedbackContext }: { feedbackContext: boolean }) {
  const linkClassName =
    "grid flex-1 place-items-center border-b-2 border-transparent px-4 py-4 text-sm text-muted-foreground transition-colors hover:text-foreground md:flex-none md:rounded-md md:border md:px-4 md:py-2 data-[status=active]:border-foreground data-[status=active]:text-foreground data-[status=active]:md:bg-muted";
  return (
    <>
      <Link
        aria-current={feedbackContext ? "page" : undefined}
        className={cn(
          linkClassName,
          feedbackContext && "border-foreground text-foreground md:bg-muted",
        )}
        to="/"
        activeOptions={{ exact: true }}
      >
        Feedback
      </Link>
      <Link className={linkClassName} to="/roadmap">
        Roadmap
      </Link>
      <Link className={linkClassName} to="/changelog">
        Changelog
      </Link>
    </>
  );
}

export default function Header() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const needsPageSearch = pathname === "/submit" || pathname.startsWith("/p/");

  return (
    <>
      <a
        className="fixed top-3 left-3 z-[100] -translate-y-20 border bg-background px-4 py-3 text-sm font-medium shadow-sm transition-transform focus-visible:translate-y-0"
        href="#main-content"
      >
        Skip to content
      </a>
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center border-b px-4 md:h-20 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:px-8">
        <a
          className="inline-flex items-center gap-3 py-3 text-lg font-semibold md:py-0"
          href="/"
          aria-label="Feedbax home"
        >
          <span
            className="grid size-10 place-items-center border bg-muted/40 text-xl font-medium"
            aria-hidden="true"
          >
            F
          </span>
          Feedbax
        </a>
        <nav
          className="order-3 col-span-2 -mx-4 flex border-t bg-background md:order-none md:col-span-1 md:col-start-2 md:row-start-1 md:mx-0 md:gap-1 md:border-0"
          aria-label="Public portal"
        >
          <Navigation feedbackContext={needsPageSearch} />
        </nav>
        <div className="flex items-center justify-self-end gap-2 md:col-start-3 md:row-start-1">
          {needsPageSearch ? (
            <CommandPaletteTrigger
              className="size-11 px-0 md:size-10"
              compact
            />
          ) : null}
          <ProfileMenu />
        </div>
      </header>
    </>
  );
}
