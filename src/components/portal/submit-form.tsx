import * as React from "react";
import { useRouter } from "@tanstack/react-router";
import { GlobeIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { CATEGORY_LABELS, LIMITS, type Category } from "@/contracts/domain";
import { createPost } from "@/server/functions";
import { clearDraft, loadDraft, parsePostDraft, POST_DRAFT_KEY, saveDraft } from "./draft";
import { ImageAttachments, extensionFor, useImageAttachments } from "./image-attachments";
import { CATEGORY_ICONS } from "./post-badges";
import { RichTextField } from "./rich-text-field";
import { useWriteGate } from "./viewer";

type Errors = Partial<Record<"title" | "body" | "category" | "image", string>>;

export function SubmitForm() {
  const { ensureWriter, reportError, viewer } = useWriteGate();
  const offered = viewer.config.categories;
  const router = useRouter();
  const ids = React.useId();
  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [category, setCategory] = React.useState<Category>(offered[0] ?? "feature");
  const [errors, setErrors] = React.useState<Errors>({});
  const [pending, setPending] = React.useState(false);
  // The post id is the idempotency key. It is reused for retries and renewed on any edit.
  const postId = React.useRef("");
  const edited = React.useCallback(() => {
    postId.current = crypto.randomUUID();
  }, []);
  const images = useImageAttachments(edited);

  // Restore a draft that survived the trip to /login.
  React.useEffect(() => {
    const draft = loadDraft(POST_DRAFT_KEY, parsePostDraft);
    postId.current = draft?.id ?? crypto.randomUUID();
    if (draft) {
      setTitle(draft.title);
      setBody(draft.body);
      // A draft saved before the admin hid its category falls back to the first offered one.
      setCategory(offered.includes(draft.category) ? draft.category : (offered[0] ?? "feature"));
    }
  }, []);

  function update(next: { title?: string; body?: string; category?: Category }) {
    const merged = {
      title: next.title ?? title,
      body: next.body ?? body,
      category: next.category ?? category,
    };
    edited();
    if (next.title !== undefined) setTitle(next.title);
    if (next.body !== undefined) setBody(next.body);
    if (next.category !== undefined) setCategory(next.category);
    if (merged.title || merged.body) saveDraft(POST_DRAFT_KEY, { id: postId.current, ...merged });
    else clearDraft(POST_DRAFT_KEY);
  }

  function validate(): Errors {
    const found: Errors = {};
    const t = title.trim();
    const b = body.trim();
    if (!t) found.title = "Give your post a title.";
    else if (t.length > LIMITS.title) found.title = `Use at most ${LIMITS.title} characters.`;
    if (!b) found.body = "Describe your idea or the problem.";
    else if (b.length > LIMITS.body)
      found.body = `Use at most ${LIMITS.body.toLocaleString("en-US")} characters.`;
    return found;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    // Kept without images, so it survives a detour to /login.
    saveDraft(POST_DRAFT_KEY, { id: postId.current, title, body, category });
    setPending(true);
    try {
      if (!(await ensureWriter())) return;
      const form = new FormData();
      form.set("id", postId.current);
      form.set("title", title.trim());
      form.set("body", body.trim());
      form.set("category", category);
      images.ready.forEach((image, i) =>
        form.append("image", image.blob, `image-${i + 1}.${extensionFor(image.blob.type)}`),
      );
      const result = await createPost({ data: form });
      if (!result.ok) {
        const { field, message } = result.error;
        if (field === "title" || field === "body" || field === "category") {
          setErrors({ [field]: message });
        } else if (
          field === "image" ||
          result.error.code === "unsupported_image" ||
          result.error.code === "too_large"
        ) {
          setErrors({ image: message });
        } else {
          reportError(result.error);
        }
        return;
      }
      clearDraft(POST_DRAFT_KEY);
      toast.success("Thanks! Your post is live.");
      router.history.push(`/posts/${result.data.postId}`);
    } catch {
      toast.error("Couldn't reach the server. Your draft is safe, so try again.");
    } finally {
      setPending(false);
    }
  }

  function onPaste(event: React.ClipboardEvent) {
    const files = Array.from(event.clipboardData.files).filter((f) => f.type.startsWith("image/"));
    if (files.length === 0 || event.clipboardData.getData("text/plain")) return;
    event.preventDefault();
    void images.add(files);
  }

  const busy = pending || images.processing;
  return (
    <form onSubmit={onSubmit} onPaste={onPaste} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-title`}>Title</Label>
        <Input
          id={`${ids}-title`}
          name="title"
          value={title}
          maxLength={LIMITS.title}
          placeholder="A short, specific title"
          autoComplete="off"
          aria-invalid={Boolean(errors.title)}
          aria-describedby={errors.title ? `${ids}-title-error` : undefined}
          onChange={(event) => update({ title: event.target.value })}
          className="h-9 max-md:h-11 max-md:text-base"
        />
        {errors.title ? (
          <p id={`${ids}-title-error`} role="alert" className="text-xs text-destructive">
            {errors.title}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${ids}-body`}>Description</Label>
        <RichTextField
          id={`${ids}-body`}
          name="body"
          variant="post"
          value={body}
          onChange={(markdown) => update({ body: markdown })}
          maxLength={LIMITS.body}
          placeholder="What should change, and why?"
          aria-invalid={Boolean(errors.body)}
          aria-describedby={errors.body ? `${ids}-body-error` : undefined}
          className="min-h-36"
        />
        <div className="flex items-start justify-between gap-3">
          <p
            id={`${ids}-body-error`}
            role={errors.body ? "alert" : undefined}
            className="text-xs text-destructive"
          >
            {errors.body}
          </p>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {body.length.toLocaleString("en-US")} / {LIMITS.body.toLocaleString("en-US")}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span id={`${ids}-category`} className="text-xs leading-none font-medium">
          Post type
        </span>
        <ToggleGroup
          aria-labelledby={`${ids}-category`}
          variant="outline"
          spacing={2}
          value={[category]}
          onValueChange={(next) => {
            const chosen = next[0] as Category | undefined;
            if (chosen) update({ category: chosen });
          }}
          className="grid w-full grid-cols-1 sm:grid-cols-[repeat(auto-fit,minmax(0,1fr))]"
        >
          {offered.map((value) => {
            const Icon = CATEGORY_ICONS[value];
            return (
              <ToggleGroupItem
                key={value}
                value={value}
                className="h-10 w-full justify-center gap-2 max-md:h-11"
              >
                <Icon aria-hidden="true" />
                {CATEGORY_LABELS[value]}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs leading-none font-medium">
          Images <span className="font-normal text-muted-foreground">(optional)</span>
        </span>
        <ImageAttachments
          slots={images.slots}
          onAdd={(files) => void images.add(files)}
          onRemove={images.remove}
        />
        {errors.image ? (
          <p role="alert" className="text-xs text-destructive">
            {errors.image}
          </p>
        ) : null}
      </div>

      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <GlobeIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Posts are public as soon as you submit them. Anyone can read your title, description and
        images, so don’t include anything private.
      </p>

      <div className="flex flex-col-reverse gap-2 border-t pt-6 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          className="max-md:h-11"
          onClick={() =>
            window.history.length > 1 ? router.history.back() : router.history.push("/")
          }
        >
          Cancel
        </Button>
        <Button type="submit" disabled={busy} className="max-md:h-11">
          {busy ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : null}
          {images.processing ? "Preparing images…" : pending ? "Posting…" : "Create post"}
        </Button>
      </div>
    </form>
  );
}
