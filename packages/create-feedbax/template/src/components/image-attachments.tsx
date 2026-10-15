import { ImagePlus, Loader2, X } from "lucide-react";
import { useId, useRef, useState } from "react";
import type { ImageAttachment } from "@feedbax/feedback";
import { Button } from "@feedbax/ui/components/button";
import { Input } from "@feedbax/ui/components/input";
import { useConnectedIdentity } from "./connected-identity-provider";
import feedbax from "../feedbax";

export function ImageAttachments({
  value,
  onChange,
  onUploadingChange,
}: {
  value: ImageAttachment[];
  onChange: (images: ImageAttachment[]) => void;
  onUploadingChange?: (pending: boolean) => void;
}) {
  const identity = useConnectedIdentity();
  if (!feedbax.connected?.images || !identity.displayName) return null;
  return (
    <ImageAttachmentInput
      value={value}
      onChange={onChange}
      onUploadingChange={onUploadingChange}
    />
  );
}
function ImageAttachmentInput({
  value,
  onChange,
  onUploadingChange,
}: {
  value: ImageAttachment[];
  onChange: (images: ImageAttachment[]) => void;
  onUploadingChange?: (pending: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const hintId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setError(undefined);
    const selected = Array.from(files);
    if (selected.length + value.length > 4) {
      setError("Choose up to four images.");
      if (input.current) input.current.value = "";
      return;
    }
    setPending(true);
    onUploadingChange?.(true);
    const next = [...value];
    try {
      for (const file of selected) {
        if (file.size > 5 * 1024 * 1024)
          throw new Error("Each image must be 5 MiB or smaller.");
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
          throw new Error("Choose a JPEG, PNG, or WebP image.");
        const response = await fetch("/internal/images", {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        const result = (await response.json()) as ImageAttachment & {
          error?: string;
        };
        if (!response.ok)
          throw new Error(result.error ?? "Couldn’t upload image.");
        next.push(result);
        onChange([...next]);
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Couldn’t upload image.",
      );
    } finally {
      setPending(false);
      onUploadingChange?.(false);
      if (input.current) input.current.value = "";
    }
  }
  async function remove(image: ImageAttachment) {
    setError(undefined);
    setPending(true);
    onUploadingChange?.(true);
    try {
      const response = await fetch(`/internal/images/${image.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Couldn’t remove image. Try again.");
      onChange(value.filter((item) => item.id !== image.id));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Couldn’t remove image.",
      );
    } finally {
      setPending(false);
      onUploadingChange?.(false);
    }
  }
  return (
    <div className="space-y-3">
      <Input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-label="Choose image attachments"
        onChange={(event) => void upload(event.currentTarget.files)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending || value.length >= 4}
        aria-describedby={hintId}
        onClick={() => input.current?.click()}
      >
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <ImagePlus aria-hidden="true" />
        )}
        {pending ? "Uploading…" : "Add images"}
      </Button>
      <p id={hintId} className="text-xs text-muted-foreground">
        Up to 4 images · JPEG, PNG, or WebP · 5 MiB each
      </p>
      {value.length ? (
        <ul className="flex flex-wrap gap-3">
          {value.map((image, index) => (
            <li key={image.id} className="relative">
              <img
                src={image.src}
                alt={`Attached image ${index + 1}`}
                className="size-24 border bg-muted object-cover"
              />
              <Button
                type="button"
                variant="secondary"
                size="icon-xs"
                className="absolute top-1 right-1"
                aria-label={`Remove image ${index + 1}`}
                disabled={pending}
                onClick={() => void remove(image)}
              >
                <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
export function ImageGallery({ images }: { images?: ImageAttachment[] }) {
  if (!images?.length) return null;
  return (
    <ul className="my-4 grid grid-cols-2 gap-3" aria-label="Attached images">
      {images.map((image, index) => (
        <li key={image.id}>
          <a
            href={image.src}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open attached image ${index + 1}`}
            className="block focus-visible:outline-2 focus-visible:outline-ring"
          >
            <img
              src={image.src}
              alt={`Attached image ${index + 1}`}
              loading="lazy"
              className="max-h-64 w-full border bg-muted/30 object-contain"
            />
          </a>
        </li>
      ))}
    </ul>
  );
}
