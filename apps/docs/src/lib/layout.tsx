import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { ExternalLink } from "lucide-react";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <span className="docs-brand">
          <span className="brand-mark" aria-hidden="true">
            F
          </span>
          <span>Feedbax</span>
          <span className="docs-label">Docs</span>
        </span>
      ),
      url: "/",
    },
    links: [
      {
        text: "Portal",
        url: "https://feedback.feedbax.dev",
        icon: <ExternalLink />,
        external: true,
      },
    ],
    githubUrl: "https://github.com/jessequartey/feedbax",
  };
}
