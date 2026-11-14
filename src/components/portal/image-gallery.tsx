import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { ImageView } from "@/contracts/domain";

export function ImageGallery({ images, title }: { images: readonly ImageView[]; title: string }) {
  const [open, setOpen] = React.useState<number | null>(null);
  const count = images.length;

  const step = React.useCallback(
    (delta: number) => setOpen((i) => (i === null ? i : (i + delta + count) % count)),
    [count],
  );

  React.useEffect(() => {
    if (open === null || count < 2) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, count, step]);

  if (count === 0) return null;
  const current = open === null ? null : images[open];

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Attached images">
        {images.map((image, i) => (
          <li key={image.id}>
            <button
              type="button"
              onClick={() => setOpen(i)}
              aria-label={`View image ${i + 1} of ${count}`}
              className="block w-full overflow-hidden border bg-muted/40 outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              <img
                src={image.url}
                width={image.width}
                height={image.height}
                alt={`Attachment ${i + 1} of ${count} for “${title}”`}
                loading="lazy"
                decoding="async"
                className="aspect-video w-full object-cover transition-opacity hover:opacity-90"
              />
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <DialogContent className="gap-3 p-3 sm:max-w-5xl">
          <DialogTitle className="sr-only">
            Image {(open ?? 0) + 1} of {count}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Attached to “{title}”. {count > 1 ? "Use the arrow keys to move between images." : ""}
          </DialogDescription>
          {current ? (
            <img
              src={current.url}
              width={current.width}
              height={current.height}
              alt={`Attachment ${(open ?? 0) + 1} of ${count} for “${title}”`}
              className="mx-auto max-h-[75vh] w-auto max-w-full object-contain"
            />
          ) : null}
          {count > 1 ? (
            <div className="flex items-center justify-between gap-3">
              <Button variant="outline" className="max-md:h-11" onClick={() => step(-1)}>
                <ChevronLeftIcon aria-hidden="true" /> Previous
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums" aria-hidden="true">
                {(open ?? 0) + 1} / {count}
              </span>
              <Button variant="outline" className="max-md:h-11" onClick={() => step(1)}>
                Next <ChevronRightIcon aria-hidden="true" />
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
