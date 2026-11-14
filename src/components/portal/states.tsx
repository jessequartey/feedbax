import * as React from "react";
import { Link } from "@tanstack/react-router";
import { InboxIcon, RefreshCwIcon, TriangleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

export function EmptyState({
  title,
  description,
  actions,
  icon: Icon = InboxIcon,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="flex size-10 items-center justify-center border bg-muted/40 text-muted-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h2 className="text-base font-medium">{title}</h2>
      {description ? <p className="max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {actions ? <div className="mt-1 flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description = "We couldn't load this. Check your connection and try again.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="mx-auto w-full max-w-[1440px] px-4 py-16 md:px-8">
      <EmptyState
        icon={TriangleAlertIcon}
        title={title}
        description={description}
        actions={
          onRetry ? (
            <Button variant="outline" className="max-md:h-11" onClick={onRetry}>
              <RefreshCwIcon aria-hidden="true" /> Try again
            </Button>
          ) : null
        }
      />
    </div>
  );
}

export function NotFoundState({
  title = "Page not found",
  description = "That page doesn't exist, or it was removed.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="mx-auto w-full max-w-[1440px] px-4 py-16 md:px-8">
      <EmptyState
        title={title}
        description={description}
        actions={
          <Button render={<Link to="/" />} nativeButton={false} className="max-md:h-11">
            Back to feedback
          </Button>
        }
      />
    </div>
  );
}
