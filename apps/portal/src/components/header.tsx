import { Link } from "@tanstack/react-router";

import { ProfileMenu } from "./profile-menu";

function Navigation() {
  const linkClassName =
    "grid flex-1 place-items-center border-b-2 border-transparent px-4 py-4 text-sm text-muted-foreground transition-colors hover:text-foreground md:flex-none md:rounded-md md:border md:px-4 md:py-2 data-[status=active]:border-foreground data-[status=active]:text-foreground data-[status=active]:md:bg-muted";
  return (
    <>
      <Link className={linkClassName} to="/" activeOptions={{ exact: true }}>
        Feedback
      </Link>
      <Link className={linkClassName} to="/roadmap">
        Roadmap
      </Link>
      <Link className={linkClassName} to="/changelog">
        Changelog
      </Link>
      <Link
        to="."
        state={{ createPostOverlay: true }}
        mask={{ to: "/submit", unmaskOnReload: true }}
        className="hidden"
        activeProps={{ "aria-current": false }}
      >
        Create Post
      </Link>
    </>
  );
}

export default function Header() {
  return (
    <header className="relative flex h-20 items-center justify-between border-b px-4 md:px-8">
      <a
        className="inline-flex items-center gap-3 text-lg font-semibold"
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
        className="absolute left-0 top-full z-10 flex w-full border-b bg-background md:static md:w-auto md:gap-1 md:border-0"
        aria-label="Public portal"
      >
        <Navigation />
      </nav>
      <ProfileMenu />
    </header>
  );
}
