import { Button } from "@feedbax/ui/components/button";
import { CodeXml, ExternalLink, Menu } from "lucide-react";
import { useState } from "react";

import { Brand } from "./brand";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="site-header">
      <Brand />
      <button
        className="nav-trigger"
        type="button"
        aria-expanded={open}
        aria-controls="site-nav"
        onClick={() => setOpen((value) => !value)}
      >
        <Menu aria-hidden="true" />
        <span className="sr-only">Toggle navigation</span>
      </button>
      <nav
        id="site-nav"
        className={open ? "site-nav is-open" : "site-nav"}
        aria-label="Primary"
      >
        <a href="/docs">Docs</a>
        <a href="https://feedback.feedbax.dev">
          Feedback <ExternalLink aria-hidden="true" />
        </a>
        <a href="https://github.com/jessequartey/feedbax">
          GitHub <CodeXml aria-hidden="true" />
        </a>
        <Button
          nativeButton={false}
          render={<a href="/docs/getting-started" />}
        >
          Get started
        </Button>
      </nav>
    </header>
  );
}
