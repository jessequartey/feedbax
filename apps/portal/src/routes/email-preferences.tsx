import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@feedbax/ui/components/button";
import feedbax from "../feedbax";
export const Route = createFileRoute("/email-preferences")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search.token === "string" ? search.token : "",
  }),
  beforeLoad: () => {
    if (!feedbax.connected?.email) throw notFound();
  },
  head: () => ({
    meta: [
      { name: "robots", content: "noindex,nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: EmailPreferencesPage,
});
function EmailPreferencesPage() {
  const { token } = Route.useSearch();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string>();
  async function unsubscribe() {
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch(
        `/internal/connected/unsubscribe?token=${encodeURIComponent(token)}`,
        { method: "POST" },
      );
      if (!response.ok)
        throw new Error(
          "This link could not be used. Try again or change email preferences in your notification inbox.",
        );
      setDone(true);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Couldn’t update email preferences.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="mx-auto max-w-lg space-y-5 px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">
        {done ? "Email notifications are off" : "Stop email notifications"}
      </h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {done
          ? "You can turn them on again in your notification inbox."
          : "You will keep receiving updates inside Feedbax."}
      </p>
      {done ? (
        <Button nativeButton={false} render={<a href="/" />} variant="outline">
          Back to feedback
        </Button>
      ) : (
        <Button
          onClick={unsubscribe}
          disabled={pending || !/^[a-f0-9]{32}\.[A-Za-z0-9_-]{43}$/.test(token)}
        >
          {pending ? "Updating…" : "Stop email notifications"}
        </Button>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </main>
  );
}
