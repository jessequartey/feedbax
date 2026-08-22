import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@feedbax/ui/components/drawer";
import { Menu } from "lucide-react";
import { useCallback, useState } from "react";
import { Link } from "@tanstack/react-router";
import { DeviceProfileControl, ThemeControl } from "../device-profile-control";

function Navigation({ onCreate }: { onCreate?: () => void }) {
  return (
    <>
      <Link to="/" activeOptions={{ exact: true }} onClick={onCreate}>
        Feedback
      </Link>
      <Link to="/roadmap" onClick={onCreate}>
        Roadmap
      </Link>
      <Link to="/changelog" onClick={onCreate}>
        Changelog
      </Link>
      <Link
        to="."
        state={{ createPostOverlay: true }}
        mask={{ to: "/submit", unmaskOnReload: true }}
        onClick={onCreate}
        activeProps={{ "aria-current": false, className: "create-post-link" }}
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
    <header className="portal-header">
      <a className="portal-brand" href="/" aria-label="Feedbax home">
        <span aria-hidden="true">F</span>Feedbax
      </a>
      <nav className="desktop-nav" aria-label="Public portal">
        <Navigation />
        <DeviceProfileControl
          key={profileConfigured ? "configured" : "empty"}
          onProfileChange={updateProfileConfigured}
        />
      </nav>
      <button
        className="mobile-menu"
        type="button"
        aria-label="Open navigation"
        onClick={() => setMobileOpen(true)}
      >
        <Menu />
      </button>
      <Drawer open={mobileOpen} onOpenChange={setMobileOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Feedbax</DrawerTitle>
            <DrawerDescription>Public portal navigation</DrawerDescription>
          </DrawerHeader>
          <nav className="mobile-nav" aria-label="Mobile public portal">
            <Navigation onCreate={() => setMobileOpen(false)} />
            <DeviceProfileControl
              key={profileConfigured ? "configured" : "empty"}
              onProfileChange={updateProfileConfigured}
            />
            {!profileConfigured ? <ThemeControl /> : null}
          </nav>
        </DrawerContent>
      </Drawer>
    </header>
  );
}
