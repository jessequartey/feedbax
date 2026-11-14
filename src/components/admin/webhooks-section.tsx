import { WebhookIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Placeholder. Ticket 08 (webhooks) replaces the body: endpoints, secrets and the delivery log. */
export function WebhooksSection() {
  return (
    <Card id="webhooks" aria-labelledby="webhooks-title">
      <CardHeader>
        <CardTitle id="webhooks-title" className="flex items-center gap-2 text-base">
          <WebhookIcon className="size-4" aria-hidden="true" /> Webhooks
        </CardTitle>
        <CardDescription>Send events to your own systems as they happen.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Coming in this release.</p>
      </CardContent>
    </Card>
  );
}
