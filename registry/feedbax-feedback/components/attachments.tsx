"use client";

// The image side of the dialog: dropzone, thumbnails, and the Screenshot / Upload / Capture-screen actions.
import * as React from "react";
import {
  Camera,
  ChevronDown,
  ImagePlus,
  Monitor,
  PencilLine,
  RefreshCcw,
  Trash2,
  Upload,
} from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ACCEPT_ATTRIBUTE } from "@/lib/feedbax/images";
import { LIMITS } from "@/lib/feedbax/types";
import { Kbd, R, R_SM, Spinner, useIsMac } from "@/components/feedbax/parts";

export type AttachmentView = {
  id: string;
  previewUrl: string;
  width: number;
  height: number;
  marks: number;
  origin: "screenshot" | "screen" | "upload" | "paste" | "drop";
};

type Props = {
  attachments: AttachmentView[];
  busy: boolean;
  disabled: boolean;
  canCaptureScreen: boolean;
  onScreenshot: () => void;
  onScreen: () => void;
  onFiles: (files: File[]) => void;
  onAnnotate: (id: string) => void;
  onRetake: (id: string) => void;
  onRemove: (id: string) => void;
};

/** Screenshot (primary), a chevron menu for "Capture screen instead…", and Upload. */
function CaptureActions({
  size = "default",
  disabled,
  canCaptureScreen,
  onScreenshot,
  onScreen,
  openPicker,
}: {
  size?: "default" | "sm";
  disabled: boolean;
  canCaptureScreen: boolean;
  onScreenshot: () => void;
  onScreen: () => void;
  openPicker: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <div className="inline-flex items-center">
        <Button type="button" size={size} disabled={disabled} onClick={onScreenshot}>
          <Camera aria-hidden data-icon="inline-start" /> Screenshot
        </Button>
        {canCaptureScreen ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="More capture options"
              disabled={disabled}
              className={cn(
                buttonVariants({ variant: "default", size: size === "sm" ? "icon-sm" : "icon" }),
                "ml-px",
              )}
            >
              <ChevronDown aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onScreen}>
                <Monitor aria-hidden /> Capture screen instead…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <Button type="button" size={size} variant="outline" disabled={disabled} onClick={openPicker}>
        <Upload aria-hidden data-icon="inline-start" /> Upload
      </Button>
    </div>
  );
}

export function Attachments(props: Props) {
  const { attachments, busy, disabled, canCaptureScreen } = props;
  const picker = React.useRef<HTMLInputElement>(null);
  const mac = useIsMac();
  const full = attachments.length >= LIMITS.images;
  const openPicker = () => picker.current?.click();

  const actions = (
    <CaptureActions
      disabled={disabled || busy}
      canCaptureScreen={canCaptureScreen}
      onScreenshot={props.onScreenshot}
      onScreen={props.onScreen}
      openPicker={openPicker}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <input
        ref={picker}
        type="file"
        multiple
        accept={ACCEPT_ATTRIBUTE}
        className="sr-only"
        tabIndex={-1}
        aria-label="Upload images"
        onChange={(event) => {
          props.onFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />

      {attachments.length === 0 ? (
        <div
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-4 border border-dashed bg-background/60 p-6 text-center",
            R,
          )}
        >
          <span
            className={cn("grid size-11 place-items-center bg-muted text-muted-foreground", R_SM)}
          >
            {busy ? <Spinner className="size-5" /> : <ImagePlus aria-hidden className="size-5" />}
          </span>
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {busy ? "Preparing your image…" : "Show us what you mean"}
            </p>
            <p className="mx-auto max-w-xs text-xs text-muted-foreground">
              Capture this page, upload an image, or paste one with{" "}
              <span className="whitespace-nowrap">
                <Kbd>{mac ? "⌘" : "Ctrl"}</Kbd> <Kbd>V</Kbd>
              </span>
              . You can draw on it before you send. Drag and drop works too.
            </p>
          </div>
          {actions}
        </div>
      ) : (
        <>
          <ul
            className={cn(
              "grid min-h-0 flex-1 content-start gap-3 overflow-y-auto pr-0.5",
              attachments.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2",
            )}
          >
            {attachments.map((a, index) => (
              <li key={a.id} className={cn("flex flex-col border bg-background", R)}>
                <button
                  type="button"
                  aria-label={`Annotate image ${index + 1}`}
                  onClick={() => props.onAnnotate(a.id)}
                  disabled={disabled}
                  className={cn(
                    "group relative flex items-center justify-center overflow-hidden bg-muted/50 outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "rounded-t-[inherit]",
                    attachments.length === 1 ? "h-56 sm:h-64" : "h-32",
                  )}
                >
                  <img
                    src={a.previewUrl}
                    alt={`Attached image ${index + 1}${a.marks ? `, with ${a.marks} mark${a.marks === 1 ? "" : "s"}` : ""}`}
                    width={a.width}
                    height={a.height}
                    className="max-h-full max-w-full object-contain"
                    draggable={false}
                  />
                  <span className="absolute inset-0 grid place-items-center bg-background/60 text-xs font-medium opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                    <span className="inline-flex items-center gap-1.5">
                      <PencilLine aria-hidden className="size-3.5" /> Annotate
                    </span>
                  </span>
                  {a.marks > 0 ? (
                    <span className="absolute top-1.5 left-1.5 bg-foreground px-1.5 py-0.5 text-[10px] font-medium text-background">
                      {a.marks} mark{a.marks === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </button>
                <div className="flex items-center gap-0.5 border-t p-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled}
                    onClick={() => props.onAnnotate(a.id)}
                  >
                    <PencilLine aria-hidden data-icon="inline-start" /> Annotate
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={disabled || busy}
                    onClick={() => props.onRetake(a.id)}
                    aria-label={`${a.origin === "screenshot" || a.origin === "screen" ? "Retake" : "Replace"} image ${index + 1}`}
                  >
                    <RefreshCcw aria-hidden data-icon="inline-start" />
                    {a.origin === "screenshot" || a.origin === "screen" ? "Retake" : "Replace"}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto"
                    disabled={disabled}
                    aria-label={`Remove image ${index + 1}`}
                    onClick={() => props.onRemove(a.id)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {busy ? (
                <span className="inline-flex items-center gap-1.5">
                  <Spinner className="size-3.5" /> Preparing…
                </span>
              ) : (
                `${attachments.length} of ${LIMITS.images} images`
              )}
            </p>
            {full ? null : <div className="shrink-0">{actions}</div>}
          </div>
        </>
      )}
    </div>
  );
}
