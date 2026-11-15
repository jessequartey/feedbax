import * as React from "react";
import { Link } from "@tanstack/react-router";
import { InboxIcon, RefreshCwIcon, TriangleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export function EmptyState({
  title,
  description,
  actions,
  action,
  icon: Icon = InboxIcon,
  titleRef,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" }>;
  /** When set, the heading can take focus (unsubscribe moves here once the result is known). */
  titleRef?: React.Ref<HTMLHeadingElement>;
}) {
  const content = actions ?? action;
  return (
    <Empty className="px-6 py-14">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle className="text-base">
          <h2 ref={titleRef} tabIndex={titleRef ? -1 : undefined}>
            {title}
          </h2>
        </EmptyTitle>
        {description ? (
          <EmptyDescription className="max-w-md text-sm">{description}</EmptyDescription>
        ) : null}
      </EmptyHeader>
      {content ? (
        <EmptyContent className="flex-row flex-wrap justify-center gap-2">{content}</EmptyContent>
      ) : null}
    </Empty>
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
