import * as React from "react";
import { Link } from "@tanstack/react-router";
import {
  CheckIcon,
  EyeOffIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CHANGELOG_LIMITS,
  type AdminChangelogEntry,
  type AdminChangelogPage,
  type ChangelogPostCandidate,
  type ChangelogPostLink,
} from "@/contracts/changelog";
import { formatDate, plural } from "@/components/portal/format";
import { Markdown } from "@/components/portal/markdown";
import { PaginationBar } from "@/components/portal/pagination-bar";
import { RichTextField } from "@/components/portal/rich-text-field";
import { StatusBadge } from "@/components/portal/post-badges";
import { EmptyState } from "@/components/portal/states";
import { markdownToText } from "@/lib/markdown";
import { cn } from "@/lib/utils";
import {
  adminChangelogCreate,
  adminChangelogDelete,
  adminChangelogSearchPosts,
  adminChangelogSetStatus,
  adminChangelogUpdate,
} from "@/server/functions";
import { ConfirmDialog } from "./confirm-dialog";
import { useAdminAction } from "./use-admin";

// ---- Post picker: publicly visible posts only (the server enforces it too) ----

function PostPicker({
  selected,
  onChange,
}: {
  selected: (ChangelogPostLink & { visible?: boolean })[];
  onChange: (next: (ChangelogPostLink & { visible?: boolean })[]) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<ChangelogPostCandidate[] | null>(null);
  const [failed, setFailed] = React.useState(false);
  const full = selected.length >= CHANGELOG_LIMITS.linkedPosts;

  React.useEffect(() => {
    let current = true;
    const timer = setTimeout(
      () => {
        adminChangelogSearchPosts({ data: { q: query.trim() } })
          .then((result) => {
            if (!current) return;
            setFailed(!result.ok);
            setResults(result.ok ? result.data : []);
          })
          .catch(() => {
            if (!current) return;
            setFailed(true);
            setResults([]);
          });
      },
      query ? 250 : 0,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query]);

  const isSelected = (id: string) => selected.some((post) => post.id === id);
  const toggle = (post: ChangelogPostCandidate) =>
    onChange(
      isSelected(post.id)
        ? selected.filter((item) => item.id !== post.id)
        : [...selected, { id: post.id, title: post.title, status: post.status }],
    );

  return (
    <div className="flex flex-col gap-3">
      {selected.length > 0 ? (
        <ul aria-label="Linked posts" className="divide-y border">
          {selected.map((post) => (
            <li key={post.id} className="flex items-center gap-2 py-1 pr-1 pl-3 text-sm">
              <span className="min-w-0 flex-1 truncate">{post.title}</span>
              {post.visible === false ? (
                <Badge variant="secondary" className="gap-1 font-normal">
                  <EyeOffIcon aria-hidden="true" /> Hidden
                </Badge>
              ) : null}
              <StatusBadge status={post.status} />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 max-md:size-11"
                aria-label={`Unlink ${post.title}`}
                onClick={() => onChange(selected.filter((item) => item.id !== post.id))}
              >
                <XIcon aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No posts linked yet.</p>
      )}
      <div className="relative">
        <SearchIcon
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          aria-label="Search posts to link"
          placeholder="Search posts to link"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-9 pl-8 max-md:h-11 max-md:text-base"
        />
      </div>
      <div
        role="group"
        aria-label="Posts that can be linked"
        className="max-h-56 divide-y overflow-y-auto border"
      >
        {results === null ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : failed ? (
          <p className="p-4 text-sm text-destructive">Couldn't load posts. Try again.</p>
        ) : results.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No matching posts.</p>
        ) : (
          results.map((post) => {
            const chosen = isSelected(post.id);
            return (
              <button
                key={post.id}
                type="button"
                aria-pressed={chosen}
                disabled={full && !chosen}
                onClick={() => toggle(post)}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm outline-none transition-colors max-md:min-h-11",
                  "hover:bg-muted/60 focus-visible:bg-muted focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset disabled:opacity-50",
                  chosen && "bg-muted",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{post.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {plural(post.votes, "vote")} · {formatDate(post.createdAt)}
                  </span>
                </span>
                <StatusBadge status={post.status} />
                {chosen ? <CheckIcon className="size-4 shrink-0" aria-label="Linked" /> : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ---- Editor: create or edit an entry ----

type Editing = AdminChangelogEntry | "new" | null;

function EntryEditor({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  const act = useAdminAction();
  const ids = React.useId();
  const entry = editing && editing !== "new" ? editing : null;
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [linked, setLinked] = React.useState<(ChangelogPostLink & { visible?: boolean })[]>([]);
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Partial<Record<"title" | "body", string>>>({});
  const key = editing === "new" ? "new" : (entry?.id ?? "");

  React.useEffect(() => {
    if (editing === null) return;
    setTitle(entry?.title ?? "");
    setBody(entry?.body ?? "");
    setErrors({});
    setLinked(entry?.posts ?? []);
    // Reset only when a different entry (or "new") is opened.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const titleProblem = title.trim().length === 0 ? "Enter a title." : null;

  async function save() {
    if (titleProblem) {
      setErrors({ title: titleProblem });
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const data = { title: title.trim(), body, postIds: linked.map((post) => post.id) };
      const done = await act(
        () =>
          entry
            ? adminChangelogUpdate({ data: { id: entry.id, ...data } })
            : adminChangelogCreate({ data }),
        entry ? "Entry saved." : "Draft created.",
        (error) => {
          if (error.field === "title" || error.field === "body") {
            setErrors({ [error.field]: error.message });
          }
        },
      );
      if (done) onClose();
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={editing !== null}
      onOpenChange={(open) => (open || pending ? undefined : onClose())}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{entry ? "Edit entry" : "New entry"}</DialogTitle>
          <DialogDescription>
            {entry?.status === "published"
              ? "This entry is public. Changes show up as soon as you save."
              : "Saved as a draft. Visitors see it only after you publish it."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${ids}-title`}>Title</Label>
            <Input
              id={`${ids}-title`}
              value={title}
              maxLength={CHANGELOG_LIMITS.title}
              placeholder="What shipped?"
              aria-invalid={Boolean(errors.title)}
              aria-describedby={errors.title ? `${ids}-title-error` : undefined}
              onChange={(event) => {
                setTitle(event.target.value);
                setErrors((prev) => ({ ...prev, title: undefined }));
              }}
              className="h-9 max-md:h-11 max-md:text-base"
            />
            {errors.title ? (
              <p id={`${ids}-title-error`} role="alert" className="text-xs text-destructive">
                {errors.title}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label id={`${ids}-body-label`} htmlFor={`${ids}-body`}>
              Details
            </Label>
            <Tabs defaultValue="write">
              <TabsList aria-label="Editor mode">
                <TabsTrigger value="write">Write</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>
              <TabsContent value="write">
                <RichTextField
                  id={`${ids}-body`}
                  aria-labelledby={`${ids}-body-label`}
                  variant="changelog"
                  value={body}
                  maxLength={CHANGELOG_LIMITS.body}
                  rows={9}
                  placeholder="What changed, and why it matters."
                  aria-invalid={Boolean(errors.body)}
                  aria-describedby={[`${ids}-body-hint`, errors.body ? `${ids}-body-error` : null]
                    .filter(Boolean)
                    .join(" ")}
                  onChange={(next) => {
                    setBody(next);
                    setErrors((prev) => ({ ...prev, body: undefined }));
                  }}
                  hideHint
                />
              </TabsContent>
              <TabsContent value="preview">
                <div className="min-h-40 border p-3">
                  {body.trim() ? (
                    <Markdown source={body} />
                  ) : (
                    <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
            {errors.body ? (
              <p id={`${ids}-body-error`} role="alert" className="text-xs text-destructive">
                {errors.body}
              </p>
            ) : null}
            <p id={`${ids}-body-hint`} className="text-xs text-muted-foreground">
              Markdown supported. Raw HTML is shown as text. Links open only for http, https and
              mailto addresses.
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-medium">Linked posts</p>
            <p className="text-xs text-muted-foreground">
              Linked posts show “Shipped in …” once this entry is published.
            </p>
            <PostPicker selected={linked} onChange={setLinked} />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={onClose}
              className="max-sm:h-11"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={pending || titleProblem !== null}
              className="max-sm:h-11"
            >
              {pending ? "Saving…" : entry ? "Save changes" : "Create draft"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---- The list ----

function EntryRow({
  entry,
  onEdit,
  onDelete,
}: {
  entry: AdminChangelogEntry;
  onEdit: (entry: AdminChangelogEntry) => void;
  onDelete: (entry: AdminChangelogEntry) => void;
}) {
  const act = useAdminAction();
  const published = entry.status === "published";
  const excerpt = markdownToText(entry.body, 200);
  return (
    <li className="flex flex-col gap-3 p-4 md:flex-row md:items-start md:gap-5 md:p-5">
      <div className="min-w-0 flex-1">
        <h3 className="text-base leading-snug font-medium break-words md:text-lg">{entry.title}</h3>
        {excerpt ? (
          <p className="mt-1 line-clamp-2 text-sm break-words text-muted-foreground">{excerpt}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2">
          <Badge variant={published ? "default" : "secondary"} className="h-6 px-2 font-normal">
            {published ? "Published" : "Draft"}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {published
              ? `Published ${formatDate(entry.publishedAt!)}`
              : `Edited ${formatDate(entry.updatedAt)}`}{" "}
            · {plural(entry.posts.length, "linked post")}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="outline" className="h-9 max-md:h-11" onClick={() => onEdit(entry)}>
          <PencilIcon aria-hidden="true" /> Edit
        </Button>
        <Button
          variant={published ? "outline" : "default"}
          className="h-9 max-md:h-11"
          onClick={() =>
            void act(
              () => adminChangelogSetStatus({ data: { id: entry.id, published: !published } }),
              published ? "Moved back to drafts." : "Published.",
            )
          }
        >
          {published ? "Unpublish" : "Publish"}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="icon"
                aria-label={`More actions for ${entry.title}`}
                className="size-9 max-md:size-11"
              />
            }
          >
            <MoreHorizontalIcon aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            {published ? (
              <>
                <DropdownMenuItem
                  render={<Link to="/changelog/$entryId" params={{ entryId: entry.id }} />}
                >
                  View public page
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(entry)}>
              <Trash2Icon aria-hidden="true" /> Delete…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

export function ChangelogAdmin({
  page,
  onPage,
}: {
  page: AdminChangelogPage;
  onPage: (page: number) => void;
}) {
  const act = useAdminAction();
  const [editing, setEditing] = React.useState<Editing>(null);
  const [doomed, setDoomed] = React.useState<AdminChangelogEntry | null>(null);
  // Keep the editor's last entry while it fades out.
  const last = React.useRef<Editing>(null);
  if (editing) last.current = editing;
  const lastDoomed = React.useRef<AdminChangelogEntry | null>(null);
  if (doomed) lastDoomed.current = doomed;
  const target = doomed ?? lastDoomed.current;
  return (
    <>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-sm text-muted-foreground">
          Drafts are private. Published entries appear on{" "}
          <Link to="/changelog" className="underline underline-offset-4">
            /changelog
          </Link>{" "}
          and in the RSS feed.
        </p>
        <Button className="h-9 max-md:h-11" onClick={() => setEditing("new")}>
          <PlusIcon aria-hidden="true" /> New entry
        </Button>
      </div>
      {page.items.length === 0 ? (
        <div className="border">
          <EmptyState
            icon={SparklesIcon}
            title="No entries yet"
            description="Write an update, or finish a post: Done posts get a draft automatically."
          />
        </div>
      ) : (
        <ul className="divide-y border" aria-label="Changelog entries">
          {page.items.map((entry) => (
            <EntryRow key={entry.id} entry={entry} onEdit={setEditing} onDelete={setDoomed} />
          ))}
        </ul>
      )}
      <PaginationBar page={page} onPage={onPage} />
      <EntryEditor editing={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={doomed !== null}
        onOpenChange={(open) => (open ? undefined : setDoomed(null))}
        title="Delete this entry?"
        description={
          <>
            “{target?.title}” will be deleted
            {target?.status === "published" ? " and disappear from /changelog and the feed" : ""}.
            The posts it links are not touched. This can't be undone.
          </>
        }
        confirmLabel="Delete entry"
        destructive
        onConfirm={async () => {
          if (!target) return false;
          const done = await act(
            () => adminChangelogDelete({ data: { id: target.id } }),
            "Entry deleted.",
          );
          return done !== null;
        }}
      />
    </>
  );
}
