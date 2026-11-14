import * as React from "react";
import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { ArrowLeftIcon, LogOutIcon, MenuIcon, ShieldIcon, UserIcon } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { initialOf } from "./format";
import { ThemeToggle } from "./theme";
import { safeRelativePath } from "./safe-path";
import { useViewer } from "./viewer";
import { backToAppUrl } from "./write-access";

const NAV = [
  { to: "/", label: "Feedback", sections: ["/", "/posts", "/submit"] },
  { to: "/roadmap", label: "Roadmap", sections: ["/roadmap"] },
  { to: "/changelog", label: "Changelog", sections: ["/changelog"] },
  { to: "/my-feedback", label: "My feedback", sections: ["/my-feedback"] },
] as const;

function isActive(pathname: string, sections: readonly string[]) {
  return sections.some((s) => (s === "/" ? pathname === "/" : pathname.startsWith(s)));
}

export function Wordmark({ name }: { name: string }) {
  return (
    <Link
      to="/"
      aria-label={`${name} home`}
      className="inline-flex min-w-0 items-center gap-3 py-3 text-lg font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring/60 md:py-0"
    >
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center border bg-muted/40 text-xl"
      >
        {initialOf(name)}
      </span>
      <span className="truncate">{name}</span>
    </Link>
  );
}

function BackToApp({ url, className }: { url: string; className?: string }) {
  return (
    <a
      href={url}
      className={cn(buttonVariants({ variant: "outline" }), "h-9 max-md:h-11", className)}
    >
      <ArrowLeftIcon aria-hidden="true" />
      Back to app
    </a>
  );
}

/** Discreet entry to /admin, rendered only for admins (the server still guards every page). */
function AdminLink({ className, onClick }: { className?: string; onClick?: () => void }) {
  return (
    <Link
      to="/admin/moderation"
      onClick={onClick}
      className={cn(
        buttonVariants({ variant: "ghost" }),
        "h-9 gap-1.5 px-3 text-sm text-muted-foreground max-md:h-11",
        className,
      )}
    >
      <ShieldIcon aria-hidden="true" />
      Admin
    </Link>
  );
}

function useSignOut() {
  const router = useRouter();
  return React.useCallback(async () => {
    const result = await authClient.signOut();
    if (result.error) {
      toast.error("Couldn't sign out. Please try again.");
      return;
    }
    await router.invalidate();
    router.history.push("/");
  }, [router]);
}

function SignInLink({ className }: { className?: string }) {
  const { pathname, href } = useRouterState({ select: (s) => s.location });
  const onAuthPage = pathname === "/login" || pathname === "/signup";
  const to = safeRelativePath(href);
  return (
    <Button
      variant="outline"
      render={<Link to="/login" search={onAuthPage || to === "/" ? {} : { to }} />}
      nativeButton={false}
      className={cn("h-9 max-md:h-11", className)}
    >
      <UserIcon aria-hidden="true" />
      Sign in
    </Button>
  );
}

function UserMenu() {
  const { user, config } = useViewer();
  const signOut = useSignOut();
  if (!user) return <SignInLink />;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" className="h-9 max-w-48 gap-2" aria-label="Account menu" />
        }
      >
        <UserIcon aria-hidden="true" />
        <span className="truncate">{user.name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {user.kind === "anonymous" ? "Posting anonymously" : `Signed in as ${user.name}`}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link to="/my-feedback" />}>My feedback</DropdownMenuItem>
        {config.email && user.kind !== "anonymous" ? (
          <DropdownMenuItem render={<Link to="/notifications" />}>
            Email notifications
          </DropdownMenuItem>
        ) : null}
        {user.kind === "anonymous" ? (
          <DropdownMenuItem render={<Link to="/login" />}>Sign in</DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={() => void signOut()}>
          <LogOutIcon aria-hidden="true" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileMenu({ pathname, backUrl }: { pathname: string; backUrl: string | null }) {
  const { user, config } = useViewer();
  const [open, setOpen] = React.useState(false);
  const signOut = useSignOut();
  const close = () => setOpen(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="outline"
            size="icon"
            aria-label="Open menu"
            className="size-11 md:hidden"
          />
        }
      >
        <MenuIcon aria-hidden="true" />
      </SheetTrigger>
      <SheetContent side="right" className="w-4/5">
        <SheetHeader>
          <SheetTitle>{config.name}</SheetTitle>
          <SheetDescription>
            {user
              ? user.kind === "anonymous"
                ? "Posting anonymously"
                : `Signed in as ${user.name}`
              : "Browse and share feedback"}
          </SheetDescription>
        </SheetHeader>
        <nav aria-label="Main" className="flex flex-col gap-1 px-4">
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={close}
              aria-current={isActive(pathname, item.sections) ? "page" : undefined}
              className={cn(
                buttonVariants({
                  variant: isActive(pathname, item.sections) ? "secondary" : "ghost",
                }),
                "h-11 justify-start px-3 text-sm",
              )}
            >
              {item.label}
            </Link>
          ))}
          {user?.admin ? <AdminLink onClick={close} className="justify-start" /> : null}
        </nav>
        <div className="mt-auto flex flex-col gap-2 border-t p-4">
          {backUrl ? <BackToApp url={backUrl} className="w-full" /> : null}
          {user ? (
            <Button
              variant="outline"
              className="h-11"
              onClick={() => {
                close();
                void signOut();
              }}
            >
              <LogOutIcon aria-hidden="true" /> Sign out
            </Button>
          ) : (
            <Link
              to="/login"
              onClick={close}
              className={cn(buttonVariants({ variant: "default" }), "h-11")}
            >
              Sign in
            </Link>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function SiteHeader() {
  const viewer = useViewer();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const backUrl = backToAppUrl(viewer);
  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="mx-auto grid h-16 w-full max-w-[1440px] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 md:h-20 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:px-6 lg:px-8">
        <Wordmark name={viewer.config.name} />
        <nav aria-label="Main" className="col-start-2 hidden items-center gap-1 md:flex">
          {NAV.map((item) => {
            const active = isActive(pathname, item.sections);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  buttonVariants({ variant: active ? "outline" : "ghost" }),
                  "h-9 px-4 text-sm",
                  !active && "text-muted-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="col-start-2 flex items-center justify-self-end gap-2 md:col-start-3">
          {backUrl ? <BackToApp url={backUrl} className="hidden md:inline-flex" /> : null}
          {viewer.user?.admin ? <AdminLink className="hidden md:inline-flex" /> : null}
          <ThemeToggle className="size-11 md:size-9" />
          <div className="hidden md:block">
            <UserMenu />
          </div>
          <MobileMenu pathname={pathname} backUrl={backUrl} />
        </div>
      </div>
    </header>
  );
}
