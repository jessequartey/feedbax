import feedbax from "./feedbax";
import { useState, type FormEvent } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type {
  MyFeedbackFilter,
  MyFeedbackPage as FeedbackPage,
  ParticipantPost,
} from "@feedbax/feedback";
import { Button } from "@feedbax/ui/components/button";
import { Input } from "@feedbax/ui/components/input";
import { Textarea } from "@feedbax/ui/components/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@feedbax/ui/components/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@feedbax/ui/components/tabs";
import { useConnectedIdentity } from "./components/connected-identity-provider";
import { useAuthorizedDraftPosts } from "./draft-post-list";
import { readCapabilities } from "./browser-post-state";

async function action<T>(input: Record<string, unknown>): Promise<T> {
  const response = await fetch("/internal/my-feedback/post", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok)
    throw new Error(
      "This submission could not be changed. Refresh and try again.",
    );
  return response.json();
}
export function MyFeedbackPage() {
  const identity = useConnectedIdentity();
  if (!identity.ready)
    return (
      <main className="feedback-index">
        <p role="status">Loading your account…</p>
      </main>
    );
  if (!identity.displayName)
    return (
      <main className="feedback-index">
        <h1 className="text-3xl font-semibold">My feedback</h1>
        <p className="my-4">
          Sign in through the product to find your submissions, supported Posts,
          and Follows across devices.
        </p>
        <Button
          nativeButton={false}
          render={<a href="/internal/identity/start" />}
        >
          Sign in
        </Button>
      </main>
    );
  return <PrivateMyFeedbackPage key={identity.sessionKey} />;
}
function PrivateMyFeedbackPage() {
  const identity = useConnectedIdentity();
  const client = useQueryClient();
  const [filter, setFilter] = useState<MyFeedbackFilter>("submitted");
  const [editing, setEditing] = useState<ParticipantPost>();
  const [message, setMessage] = useState<string>();
  const query = useInfiniteQuery({
    queryKey: ["my-feedback", identity.sessionKey, filter],
    enabled: identity.ready && Boolean(identity.displayName),
    gcTime: 0,
    staleTime: 0,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam, signal }): Promise<FeedbackPage> => {
      const params = new URLSearchParams({ filter });
      if (pageParam) params.set("cursor", pageParam);
      const response = await fetch(`/internal/my-feedback?${params}`, {
        cache: "no-store",
        credentials: "same-origin",
        signal,
      });
      if (!response.ok) throw new Error("Your feedback could not be loaded.");
      return response.json();
    },
    getNextPageParam: (last) => last.nextCursor,
  });
  const reload = () => client.invalidateQueries({ queryKey: ["my-feedback"] });
  async function edit(id: string) {
    setMessage(undefined);
    try {
      const post = await action<ParticipantPost>({ action: "read", id });
      if (!post.editable) throw new Error();
      setEditing(post);
    } catch {
      setMessage(
        "This draft is no longer available to edit. Refresh the list.",
      );
    }
  }
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <main className="feedback-index mx-auto w-full max-w-4xl px-4 py-8">
      <header className="mb-7">
        <p className="feedback-eyebrow">Your participation</p>
        <h1 className="text-3xl font-semibold">My feedback</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Only you can see this page. Pending submissions appear here before the
          Product Team publishes them in the portal.
        </p>
      </header>
      <Tabs
        value={filter}
        onValueChange={(value) => {
          if (
            value === "submitted" ||
            value === "supported" ||
            value === "following"
          )
            setFilter(value);
        }}
      >
        <TabsList aria-label="My feedback views">
          <TabsTrigger value="submitted">Submitted</TabsTrigger>
          <TabsTrigger value="supported">Supported</TabsTrigger>
          <TabsTrigger value="following">Following</TabsTrigger>
        </TabsList>
        <TabsContent value={filter} className="mt-5">
          {query.isPending ? (
            <p role="status">Loading your feedback…</p>
          ) : query.isError ? (
            <div role="alert">
              <p>We couldn’t load your feedback.</p>
              <Button variant="outline" onClick={() => void query.refetch()}>
                Try again
              </Button>
            </div>
          ) : items.length ? (
            <ul className="divide-y divide-border">
              {items.map((post) => (
                <li
                  key={post.id ?? post.slug}
                  className="flex flex-wrap items-start justify-between gap-4 py-5"
                >
                  <div className="min-w-0 flex-1">
                    <h2 className="break-words text-base font-medium">
                      {post.published ? (
                        <a
                          href={`/p/${encodeURIComponent(post.slug)}`}
                          className="hover:underline"
                        >
                          {post.title}
                        </a>
                      ) : (
                        post.title
                      )}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {post.withdrawn
                        ? "Withdrawn"
                        : post.unavailable
                          ? "Currently unavailable"
                          : post.published
                            ? post.status
                            : `${post.status ?? "New"} · Pending moderation`}
                    </p>
                  </div>
                  {post.editable && post.id ? (
                    <Button
                      variant="outline"
                      onClick={() => void edit(post.id!)}
                    >
                      Edit draft
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-8 text-sm text-muted-foreground">
              {filter === "submitted"
                ? "Your submissions will appear here."
                : filter === "supported"
                  ? "Posts you support will appear here."
                  : "Posts you follow will appear here."}
            </p>
          )}
          {query.hasNextPage ? (
            <Button
              className="mt-4"
              variant="outline"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetchingNextPage ? "Loading…" : "Load more"}
            </Button>
          ) : null}
        </TabsContent>
      </Tabs>
      {filter === "submitted" ? <BrowserDraftClaims onLinked={reload} /> : null}
      {message ? (
        <p role="alert" className="mt-4 text-sm">
          {message}
        </p>
      ) : null}
      <Dialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(undefined);
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
          {editing ? (
            <OwnerDraftEditor
              key={editing.id}
              post={editing}
              onSaved={async () => {
                setEditing(undefined);
                await reload();
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}
function OwnerDraftEditor({
  post,
  onSaved,
}: {
  post: ParticipantPost;
  onSaved(): Promise<void>;
}) {
  const [title, setTitle] = useState(post.title);
  const [description, setDescription] = useState(post.description);
  const [type, setType] = useState(post.type);
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  async function mutate(withdraw = false) {
    setPending(true);
    setError(undefined);
    try {
      await action({
        action: withdraw ? "withdraw" : "edit",
        id: post.id,
        ...(withdraw ? {} : { title, description, type }),
      });
      await onSaved();
    } catch {
      setError(
        "The draft could not be changed. It may have been published or moved beyond New.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <DialogTitle>Edit your draft</DialogTitle>
      <DialogDescription>
        You can change this submission while it is New and unpublished.
      </DialogDescription>
      <form
        className="grid gap-4"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void mutate();
        }}
      >
        <label className="grid gap-2 text-sm">
          Title
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={feedbax.submissions.maxTitleLength}
            required
            disabled={pending}
          />
        </label>
        <label className="grid gap-2 text-sm">
          Description
          <Textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={feedbax.submissions.maxDescriptionLength}
            required
            disabled={pending}
            rows={6}
          />
        </label>
        <label className="grid gap-2 text-sm">
          Type
          <select
            className="h-10 border border-input bg-background px-3"
            value={type}
            onChange={(event) => setType(event.target.value as typeof type)}
            disabled={pending}
          >
            <option>Feature Request</option>
            <option>Bug Report</option>
            <option>General Feedback</option>
          </select>
        </label>
        {error ? <p role="alert">{error}</p> : null}
        <div className="flex flex-wrap justify-between gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              if (confirming) void mutate(true);
              else setConfirming(true);
            }}
          >
            {confirming ? "Confirm withdrawal" : "Withdraw draft"}
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
        {confirming ? (
          <p className="text-sm text-muted-foreground">
            Withdrawing removes this draft from the portal. Confirm only if you
            no longer want to submit it.
          </p>
        ) : null}
      </form>
    </>
  );
}
function BrowserDraftClaims({ onLinked }: { onLinked(): Promise<unknown> }) {
  const drafts = useAuthorizedDraftPosts({ sort: "new" });
  const [pending, setPending] = useState<string>();
  const [message, setMessage] = useState<string>();
  async function claim(id: string) {
    setPending(id);
    setMessage(undefined);
    try {
      const saved = readCapabilities(window.localStorage)[id];
      if (!saved) throw new Error();
      await action({
        action: "claim",
        id,
        browserCapability: saved.browserCapability,
      });
      await onLinked();
      setMessage("Draft linked to your product account.");
    } catch {
      setMessage(
        "This draft could not be linked. Its browser access may no longer be valid, or it may belong to another account.",
      );
    } finally {
      setPending(undefined);
    }
  }
  if (!drafts.length) return null;
  return (
    <section
      aria-label="Drafts saved in this browser"
      className="mt-8 border-t border-border pt-6"
    >
      <h2 className="font-medium">Drafts saved in this browser</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Link a draft using this browser’s existing access so you can find it on
        your other devices.
      </p>
      <ul className="mt-3 space-y-3">
        {drafts.map((draft) => (
          <li
            key={draft.id}
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <span className="text-sm">{draft.title}</span>
            <Button
              variant="outline"
              disabled={Boolean(pending)}
              onClick={() => void claim(draft.id)}
            >
              {pending === draft.id ? "Linking…" : "Link draft"}
            </Button>
          </li>
        ))}
      </ul>
      {message ? (
        <p role="status" className="mt-3 text-sm">
          {message}
        </p>
      ) : null}
    </section>
  );
}
