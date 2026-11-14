import { Link, useRouterState } from "@tanstack/react-router";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/admin/moderation", label: "Moderation" },
  { to: "/admin/users", label: "Users" },
  { to: "/admin/settings", label: "Settings" },
] as const;

/** Tab navigation for /admin. Links, not state, so every tab is a URL. */
export function AdminNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav aria-label="Admin" className="flex gap-1 overflow-x-auto border-b pb-3">
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.to);
        return (
          <Link
            key={tab.to}
            to={tab.to}
            aria-current={active ? "page" : undefined}
            className={cn(
              buttonVariants({ variant: active ? "outline" : "ghost" }),
              "h-9 px-4 text-sm max-md:h-11",
              !active && "text-muted-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
