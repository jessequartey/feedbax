import * as React from "react";
import { ImagePlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { LIMITS } from "@/contracts/domain";
import { cn } from "@/lib/utils";
import { ACCEPTED_IMAGE_TYPES, extensionFor, normalizeImage, screenIncoming } from "./images";

export type Attachment = {
  key: string;
  name: string;
  /** The canvas-normalised bytes that will be uploaded. */
  blob: Blob;
  /** Local object URL for the preview. Revoked on remove and unmount. */
  previewUrl: string;
  width: number;
  height: number;
};

type Slot =
  | { key: string; name: string; status: "processing" }
  | (Attachment & { status: "ready" });

function formatBytes(bytes: number) {
  return bytes >= 1_048_576
    ? `${(bytes / 1_048_576).toFixed(1)} MB`
    : `${Math.ceil(bytes / 1024)} KB`;
}

/** Owns the attachment list: screening, normalisation, previews and cleanup. */
export function useImageAttachments(onChange?: () => void) {
  const [slots, setSlots] = React.useState<Slot[]>([]);
  const slotsRef = React.useRef<Slot[]>([]);
  slotsRef.current = slots;
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  React.useEffect(
    () => () => {
      for (const slot of slotsRef.current) {
        if (slot.status === "ready") URL.revokeObjectURL(slot.previewUrl);
      }
    },
    [],
  );

  const add = React.useCallback(async (incoming: File[]) => {
    if (incoming.length === 0) return;
    const { accepted, rejected } = screenIncoming(incoming, slotsRef.current.length);
    for (const item of rejected) toast.error(`${item.name || "Image"}: ${item.reason}`);
    if (accepted.length === 0) return;

    const pending = accepted.map((file) => ({ file, key: crypto.randomUUID() }));
    setSlots((current) => [
      ...current,
      ...pending.map(({ file, key }) => ({
        key,
        name: file.name || "Pasted image",
        status: "processing" as const,
      })),
    ]);
    onChangeRef.current?.();

    await Promise.all(
      pending.map(async ({ file, key }) => {
        try {
          const normalized = await normalizeImage(file);
          const attachment: Slot = {
            key,
            name: file.name || "Pasted image",
            blob: normalized.blob,
            previewUrl: URL.createObjectURL(normalized.blob),
            width: normalized.width,
            height: normalized.height,
            status: "ready",
          };
          setSlots((current) => current.map((s) => (s.key === key ? attachment : s)));
        } catch (error) {
          setSlots((current) => current.filter((s) => s.key !== key));
          toast.error(
            `${file.name || "Image"}: ${error instanceof Error ? error.message : "couldn't be added."}`,
          );
        }
      }),
    );
  }, []);

  const remove = React.useCallback((key: string) => {
    setSlots((current) => {
      const target = current.find((s) => s.key === key);
      if (target?.status === "ready") URL.revokeObjectURL(target.previewUrl);
      return current.filter((s) => s.key !== key);
    });
    onChangeRef.current?.();
  }, []);

  const ready = slots.filter((s): s is Attachment & { status: "ready" } => s.status === "ready");
  return {
    slots,
    ready,
    processing: slots.some((s) => s.status === "processing"),
    add,
    remove,
  };
}

export function ImageAttachments({
  slots,
  onAdd,
  onRemove,
}: {
  slots: ReturnType<typeof useImageAttachments>["slots"];
  onAdd: (files: File[]) => void;
  onRemove: (key: string) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const full = slots.length >= LIMITS.images;

  return (
    <div className="flex flex-col gap-3">
      <div
        role="group"
        aria-label="Add images"
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          onAdd(Array.from(event.dataTransfer.files));
        }}
        className={cn(
          "flex flex-col items-center gap-2 border border-dashed px-4 py-6 text-center transition-colors",
          dragging ? "border-ring bg-muted" : "bg-muted/20",
          full && "opacity-60",
        )}
      >
        <ImagePlusIcon className="size-6 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm">
          Drag images here, paste them (<kbd className="font-sans">⌘/Ctrl</kbd>+
          <kbd className="font-sans">V</kbd>), or
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={full}
          className="max-md:h-11"
          onClick={() => inputRef.current?.click()}
        >
          Choose images
        </Button>
        <p className="text-xs text-muted-foreground">
          PNG, JPEG or WebP. Up to {LIMITS.images} images,{" "}
          {Math.round(LIMITS.imageBytes / 1_048_576)} MB each.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose images to attach"
          onChange={(event) => {
            onAdd(Array.from(event.target.files ?? []));
            event.target.value = "";
          }}
        />
      </div>
      {slots.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Attached images">
          {slots.map((slot) => (
            <li key={slot.key} className="relative border bg-muted/20">
              {slot.status === "ready" ? (
                <>
                  <img
                    src={slot.previewUrl}
                    width={slot.width}
                    height={slot.height}
                    alt={`Preview of ${slot.name}`}
                    className="aspect-video w-full object-cover"
                  />
                  <p className="truncate px-2 py-1.5 text-xs text-muted-foreground">
                    {slot.name} · {formatBytes(slot.blob.size)}
                  </p>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="secondary"
                    aria-label={`Remove ${slot.name}`}
                    className="absolute top-1.5 right-1.5 max-md:size-11"
                    onClick={() => onRemove(slot.key)}
                  >
                    <XIcon aria-hidden="true" />
                  </Button>
                </>
              ) : (
                <div role="status" aria-label={`Preparing ${slot.name}`}>
                  <Skeleton className="aspect-video w-full" />
                  <p className="truncate px-2 py-1.5 text-xs text-muted-foreground">Preparing…</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export { extensionFor };
