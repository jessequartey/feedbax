import * as React from "react";
import { Link, useRouter } from "@tanstack/react-router";
import { GlobeIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { SuggestSimilarResult } from "@/contracts/ai";
import { CATEGORY_LABELS, LIMITS, type Category } from "@/contracts/domain";
import { createPost } from "@/server/functions";
import { plural } from "./format";
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
  const [similar, setSimilar] = React.useState<SuggestSimilarResult | null>(null);
  // Once the user picks a post type by hand, the suggestion no longer applies.
  const [categoryTouched, setCategoryTouched] = React.useState(false);

  // Only suggest a type this portal offers, that the user has not picked by hand, and that
  // differs from what is already selected.
  const suggestedCategory =
    similar?.suggestedCategory &&
    !categoryTouched &&
    similar.suggestedCategory !== category &&
    offered.includes(similar.suggestedCategory)
      ? similar.suggestedCategory
      : null;

  // Duplicate suggestions while typing: local FTS only, debounced, title only
  // (the rich-text editor stays lazy; its plain text is not needed here).
  React.useEffect(() => {
    const query = title.trim();
    if (query.length < 4) {
      setSimilar(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search/similar?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => setSimilar(data as SuggestSimilarResult | null))
        .catch(() => undefined);
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [title]);
  // The post id is the idempotency key. It is reused for retries and renewed on any edit.
  const postId = React.useRef("");
  const edited = React.useCallback(() => {
    postId.current = crypto.randomUUID();
  }, []);
  const images = useImageAttachments(edited);

  // Restore the shared draft after switching views or returning from /login.
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
    // Save even an empty form: selecting a post type is a draft edit too.
    saveDraft(POST_DRAFT_KEY, { id: postId.current, ...merged });
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
      toast.success(
        result.data.heldForReview
          ? "Thanks! Your post is awaiting admin review."
          : "Thanks! Your post is live.",
      );
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
        {similar && (similar.items.length > 0 || suggestedCategory) ? (
          <div className="flex flex-col gap-2 border p-3" aria-live="polite">
            {similar.items.length > 0 ? (
              <>
                <p className="text-sm font-medium">
                  Similar posts already exist — vote on one instead?
                </p>
                <ul className="flex flex-col gap-1">
                  {similar.items.map((item) => (
                    <li key={item.id}>
                      <Link
                        to="/posts/$postId"
                        params={{ postId: item.id }}
                        className="text-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
                      >
                        {item.title}
                      </Link>{" "}
                      <span className="text-xs text-muted-foreground">
                        ({plural(item.votes, "vote")})
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {suggestedCategory ? (
              <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                Suggested post type:
                <Badge variant="outline">{CATEGORY_LABELS[suggestedCategory]}</Badge>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 max-md:h-11"
                  onClick={() => {
                    setCategoryTouched(true);
                    update({ category: suggestedCategory });
                  }}
                >
                  Use suggestion
                </Button>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label id={`${ids}-body-label`} htmlFor={`${ids}-body`}>
          Description
        </Label>
        <RichTextField
          id={`${ids}-body`}
          aria-labelledby={`${ids}-body-label`}
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
            if (chosen) {
              setCategoryTouched(true);
              update({ category: chosen });
            }
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
