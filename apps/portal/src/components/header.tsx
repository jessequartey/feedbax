import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@feedbax/ui/components/drawer";
import { Menu } from "lucide-react";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { DeviceProfileControl } from "../device-profile-control";

function Navigation({ onCreate }: { onCreate?: () => void }) {
  return (
    <>
      <a href="/">Feedback</a>
      <a href="/roadmap">Roadmap</a>
      <a href="/changelog">Changelog</a>
      <Link
        to="."
        state={{ createPostOverlay: true }}
        mask={{ to: "/submit", unmaskOnReload: true }}
        onClick={onCreate}
      >
        Create Post
      </Link>
    </>
  );
}
export default function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <header className="portal-header">
      <a className="portal-brand" href="/" aria-label="Feedbax home">
        <span aria-hidden="true">F</span>Feedbax
      </a>
      <nav className="desktop-nav" aria-label="Public portal">
        <Navigation />
        <DeviceProfileControl />
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
            <DeviceProfileControl />
          </nav>
        </DrawerContent>
      </Drawer>
    </header>
  );
}
