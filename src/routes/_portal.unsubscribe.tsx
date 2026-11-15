import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MailIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EMAIL_LABELS } from "@/components/portal/notification-settings";
import { pageTitle } from "@/components/portal/route-head";
import { EmptyState } from "@/components/portal/states";
import type { EmailKind } from "@/email/unsubscribe";
import { unsubscribeEmail } from "@/server/functions";

type LinkSearch = { u?: string; k?: string; p?: string; t?: string };

export const Route = createFileRoute("/_portal/unsubscribe")({
  validateSearch: (raw: Record<string, unknown>): LinkSearch => ({
    u: typeof raw.u === "string" ? raw.u : undefined,
    k: typeof raw.k === "string" ? raw.k : undefined,
    ...(typeof raw.p === "string" ? { p: raw.p } : {}),
    t: typeof raw.t === "string" ? raw.t : undefined,
  }),
  head: ({ matches }) => pageTitle(matches, "Unsubscribe"),
  component: UnsubscribePage,
});

const NOUN: Record<EmailKind, string> = {
  status: "status change",
  replies: "reply",
  changelog: "changelog",
  digest: "admin digest",
};

/**
 * The footer link of every email lands here. A visit never changes anything (mail scanners
 * open links); pressing the button does, and needs no sign-in: the signed link is the proof.
 */
function UnsubscribePage() {
  const search = Route.useSearch();
  const [state, setState] = React.useState<"idle" | "saving" | "done" | "failed">("idle");
  const [kind, setKind] = React.useState<EmailKind | null>(null);
  const [postId, setPostId] = React.useState<string | null>(null);
  const resultRef = React.useRef<HTMLHeadingElement>(null);
  const label = search.k && search.k in NOUN ? NOUN[search.k as EmailKind] : "these";
  const isPost = Boolean(search.p);

  React.useEffect(() => {
    if (state === "done" || state === "failed") resultRef.current?.focus();
  }, [state]);

  const confirm = async () => {
    setState("saving");
    try {
      const result = await unsubscribeEmail({ data: search });
      if (!result.ok) throw new Error(result.error.message);
      setKind(result.data.kind);
      setPostId(result.data.postId ?? null);
      setState("done");
    } catch {
      setState("failed");
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 md:px-6">
      <div className="border">
        {state === "done" ? (
          postId ? (
            <EmptyState
              titleRef={resultRef}
              icon={MailIcon}
              title="You've unfollowed this post"
              description="You won't get any more status change or reply emails about this post. You can follow it again from the post page any time."
              actions={
                <>
                  <Button
                    render={<Link to="/posts/$postId" params={{ postId }} />}
                    nativeButton={false}
                    className="max-md:h-11"
                  >
                    View post
                  </Button>
                  <Button
                    variant="outline"
                    render={<Link to="/notifications" />}
                    nativeButton={false}
                    className="max-md:h-11"
                  >
                    Email preferences
                  </Button>
                </>
              }
            />
          ) : (
            <EmptyState
              titleRef={resultRef}
              icon={MailIcon}
              title={`You won't get ${kind ? NOUN[kind] : label} emails`}
              description={`${kind ? EMAIL_LABELS[kind].label : "That email"} is off for your account. You can turn it back on any time.`}
              actions={
                <Button
                  variant="outline"
                  render={<Link to="/notifications" />}
                  nativeButton={false}
                  className="max-md:h-11"
                >
                  Email preferences
                </Button>
              }
            />
          )
        ) : !search.u || !search.k || !search.t || state === "failed" ? (
          <EmptyState
            titleRef={state === "failed" ? resultRef : undefined}
            icon={MailIcon}
            title={isPost ? "This unfollow link isn't valid" : "This unsubscribe link isn't valid"}
            description="It may be cut off or edited. Use the link in the email again, or choose what you get in your email preferences."
            actions={
              <Button
                variant="outline"
                render={<Link to="/notifications" />}
                nativeButton={false}
                className="max-md:h-11"
              >
                Email preferences
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={MailIcon}
            title={isPost ? "Unfollow this post?" : `Stop ${label} emails?`}
            description={
              isPost
                ? "You'll stop getting status change and reply emails for this post. Other posts and your email preferences aren't affected."
                : "You'll stop getting this kind of email. Other emails aren't affected."
            }
            actions={
              <Button
                onClick={() => void confirm()}
                disabled={state === "saving"}
                className="max-md:h-11"
              >
                {isPost
                  ? state === "saving"
                    ? "Unfollowing…"
                    : "Unfollow"
                  : state === "saving"
                    ? "Unsubscribing…"
                    : "Unsubscribe"}
              </Button>
            }
          />
        )}
      </div>
    </div>
  );
}
