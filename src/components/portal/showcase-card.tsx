import * as React from "react";
import { XIcon } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FEEDBAX_DESCRIPTION, FEEDBAX_REPO_URL } from "@/contracts/brand";
import { cn } from "@/lib/utils";
import { useViewer } from "./viewer";

export const SHOWCASE_DISMISSED_KEY = "feedbax-showcase-dismissed";

export function isShowcaseDismissed(): boolean {
  try {
    return localStorage.getItem(SHOWCASE_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissShowcase() {
  try {
    localStorage.setItem(SHOWCASE_DISMISSED_KEY, "1");
  } catch {
    // Storage can be blocked; the card still closes for this visit.
  }
}

/** A tiny feedback-box mascot with a speech bubble. Drawn in currentColor. */
function Mascot({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M8 22h32v18a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V22Z" />
      <path d="M8 22 12 14h24l4 8" />
      <path d="M19 22v3a5 5 0 0 0 10 0v-3" />
      <circle cx="19.5" cy="32" r="1" fill="currentColor" stroke="none" />
      <circle cx="28.5" cy="32" r="1" fill="currentColor" stroke="none" />
      <path d="M20 36.5q4 2.5 8 0" />
      <path d="M32 4h10a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-4l-3 3v-3h-3a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
    </svg>
  );
}

/**
 * The "Get your own Feedbax" card. Rendered only when the portal opts in with
 * `showcase: true`; once dismissed it stays hidden on this browser.
 */
export function ShowcaseCard({ inline = false }: { inline?: boolean }) {
  const { config } = useViewer();
  // Read synchronously so a dismissed card never flashes. On the server there is no storage.
  const [dismissed, setDismissed] = React.useState(() =>
    typeof window === "undefined" ? false : isShowcaseDismissed(),
  );
  if (!config.showcase || dismissed) return null;

  return (
    <>
      {/* Keeps the bottom of the page (pagination, submit button) clear of the floating card. */}
      {!inline && (
        <div
          aria-hidden="true"
          className="h-32 md:h-64 lg:[body:has([data-showcase-slot])_&]:hidden"
        />
      )}
      <div
        role="complementary"
        aria-label="Get your own Feedbax"
        className={cn(
          "feedbax-hang",
          inline
            ? "relative mt-6"
            : // Pages with a sidebar slot show the card there on desktop, so it never covers the filters.
              "fixed inset-x-3 bottom-3 z-40 md:inset-x-auto md:right-6 md:bottom-6 md:w-64 lg:[body:has([data-showcase-slot])_&]:hidden",
        )}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-6 left-6 hidden h-6 w-px bg-foreground/25 md:block"
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-6 right-6 hidden h-6 w-px bg-foreground/25 md:block"
        />
        <Card
          className={cn(
            "relative",
            !inline && "max-md:flex-row max-md:items-start max-md:gap-3 max-md:px-3 max-md:py-3",
            "md:gap-3 md:px-4 md:shadow-sm",
          )}
        >
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Dismiss"
            className="absolute top-1.5 right-1.5 text-muted-foreground max-md:size-8"
            onClick={() => {
              dismissShowcase();
              setDismissed(true);
            }}
          >
            <XIcon aria-hidden="true" />
          </Button>
          <Mascot className="size-8 shrink-0 text-muted-foreground md:size-9" />
          <div className="flex min-w-0 flex-1 flex-col gap-1 pr-5 md:pr-0">
            <p className="text-sm font-medium">Want a board like this?</p>
            <p className="text-muted-foreground max-md:line-clamp-2">{FEEDBAX_DESCRIPTION}</p>
            <a
              href={FEEDBAX_REPO_URL}
              target="_blank"
              rel="noopener"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-1 w-fit")}
            >
              Get it on GitHub →
            </a>
          </div>
        </Card>
      </div>
    </>
  );
}

/**
 * Sidebar home for the card on desktop. While a slot is on the page, the floating card hides at
 * `lg` and up (the slot stays mounted after dismissal, so the floating card never reappears).
 */
export function ShowcaseSlot() {
  const { config } = useViewer();
  if (!config.showcase) return null;
  return (
    <div data-showcase-slot="" className="hidden pt-4 lg:block">
      <ShowcaseCard inline />
    </div>
  );
}
