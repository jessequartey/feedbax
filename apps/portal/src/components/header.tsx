import { UserCircle } from "lucide-react";
import { useCallback, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@feedbax/ui/components/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@feedbax/ui/components/drawer";
import { DeviceProfileControl, ThemeControl } from "../device-profile-control";

function Navigation() {
  return (
    <>
      <Link
        className="grid flex-1 place-items-center px-4 py-4 text-sm text-muted-foreground transition-colors hover:text-foreground md:flex-none md:py-2"
        activeProps={{
          className:
            "border-b-2 border-foreground text-foreground md:border md:bg-muted/40",
        }}
        to="/"
        activeOptions={{ exact: true }}
      >
        Feedback
      </Link>
      <Link
        className="grid flex-1 place-items-center px-4 py-4 text-sm text-muted-foreground transition-colors hover:text-foreground md:flex-none md:py-2"
        activeProps={{
          className:
            "border-b-2 border-foreground text-foreground md:border md:bg-muted/40",
        }}
        to="/roadmap"
      >
        Roadmap
      </Link>
      <Link
        className="grid flex-1 place-items-center px-4 py-4 text-sm text-muted-foreground transition-colors hover:text-foreground md:flex-none md:py-2"
        activeProps={{
          className:
            "border-b-2 border-foreground text-foreground md:border md:bg-muted/40",
        }}
        to="/changelog"
      >
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileConfigured, setProfileConfigured] = useState(false);
  const updateProfileConfigured = useCallback(
    (configured: boolean) => setProfileConfigured(configured),
    [],
  );
  return (
    <header className="relative flex h-24 items-center justify-between border-b px-6 md:h-20 md:px-8">
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
      <div className="hidden items-center gap-2 border px-3 py-2 md:flex">
        <UserCircle aria-hidden="true" />
        <DeviceProfileControl
          key={profileConfigured ? "configured" : "empty"}
          onProfileChange={updateProfileConfigured}
        />
      </div>
      <Button
        className="md:hidden"
        variant="outline"
        size="icon-lg"
        type="button"
        aria-label="Open navigation"
        onClick={() => setMobileOpen(true)}
      >
        <UserCircle />
      </Button>
      <Drawer open={mobileOpen} onOpenChange={setMobileOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Profile</DrawerTitle>
            <DrawerDescription>Device preferences</DrawerDescription>
          </DrawerHeader>
          <div className="grid gap-4 p-6">
            <DeviceProfileControl
              key={profileConfigured ? "configured" : "empty"}
              onProfileChange={updateProfileConfigured}
            />
            {!profileConfigured ? <ThemeControl /> : null}
          </div>
        </DrawerContent>
      </Drawer>
    </header>
  );
}
