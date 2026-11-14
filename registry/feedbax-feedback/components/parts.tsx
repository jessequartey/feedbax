"use client";

// Small shared pieces for the Feedbax dialog. Built only from the host's own shadcn primitives.
import * as React from "react";
import { LoaderCircle } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Per-radius CSS variables so custom surfaces follow whatever corner style the host's dialog uses. */
export const RADIUS_VARS = { "--fbx-r": "0px", "--fbx-r-sm": "0px" } as React.CSSProperties;
export const R = "rounded-[var(--fbx-r)]";
export const R_SM = "rounded-[var(--fbx-r-sm)]";

/** Reads the host dialog's corner radius once, so cards and thumbnails match the host's style. */
export function useHostRadius(ref: React.RefObject<HTMLElement | null>) {
  React.useLayoutEffect(() => {
    const el = ref.current;
    const host = el?.parentElement;
    if (!el || !host) return;
    const radius = getComputedStyle(host).borderTopLeftRadius || "0px";
    el.style.setProperty("--fbx-r", radius);
    el.style.setProperty("--fbx-r-sm", `calc(${radius} * 0.75)`);
  }, [ref]);
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle aria-hidden className={cn("size-4 animate-spin", className)} />;
}

export function useIsMac(): boolean {
  const [mac, setMac] = React.useState(false);
  React.useEffect(() => {
    setMac(/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent));
  }, []);
  return mac;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd
      data-slot="kbd"
      className="pointer-events-none inline-flex h-4 min-w-4 items-center justify-center rounded-[2px] border border-current/30 px-1 font-sans text-[10px] leading-none font-medium opacity-80 select-none"
    >
      {children}
    </kbd>
  );
}

type IconTipProps = Omit<React.ComponentProps<"button">, "children"> & {
  label: string;
  shortcut?: string;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  children: React.ReactNode;
};

/** A button with an accessible name and a tooltip (label + keyboard shortcut). */
export function IconTip({
  label,
  shortcut,
  variant = "ghost",
  size = "icon",
  className,
  children,
  ...props
}: IconTipProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={label}
        aria-keyshortcuts={shortcut}
        className={cn(buttonVariants({ variant, size }), className)}
        {...(props as object)}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut ? <Kbd>{shortcut}</Kbd> : null}
      </TooltipContent>
    </Tooltip>
  );
}

/** Roving-tabindex helper for radio-style groups (arrow keys move and select). */
export function useRoving(count: number, selected: number, onSelect: (index: number) => void) {
  return (index: number) => ({
    tabIndex: (selected < 0 ? index === 0 : index === selected) ? 0 : -1,
    onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
      const keys: Record<string, number> = {
        ArrowRight: index + 1,
        ArrowDown: index + 1,
        ArrowLeft: index - 1,
        ArrowUp: index - 1,
        Home: 0,
        End: count - 1,
      };
      if (!(event.key in keys)) return;
      event.preventDefault();
      event.stopPropagation();
      const next = (keys[event.key] + count) % count;
      onSelect(next);
      const group = event.currentTarget.closest("[role='radiogroup']");
      group?.querySelectorAll<HTMLElement>("[role='radio']")[next]?.focus();
    },
  });
}

type ConfirmProps = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** An in-dialog confirmation (no second modal). Focus starts on the safe choice; Escape cancels. */
export function ConfirmBar({
  title,
  description,
  confirmLabel,
  cancelLabel = "Keep editing",
  destructive,
  onConfirm,
  onCancel,
}: ConfirmProps) {
  const box = React.useRef<HTMLDivElement>(null);
  const id = React.useId();
  // Focus starts on the safe choice (the first button).
  React.useEffect(() => box.current?.querySelector("button")?.focus(), []);
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-background/75 p-4 backdrop-blur-[2px]">
      <div
        ref={box}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        aria-describedby={`${id}-d`}
        className={cn("w-full max-w-sm border bg-popover p-4 text-popover-foreground shadow-lg", R)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onCancel();
          }
        }}
      >
        <h3 id={`${id}-t`} className="text-sm font-medium">
          {title}
        </h3>
        <p id={`${id}-d`} className="mt-1 text-xs text-muted-foreground">
          {description}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
