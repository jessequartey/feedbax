"use client";

// Annotation editor: plain Canvas 2D + Pointer Events. The picture is an immutable bitmap, every mark is
// an Operation in a command history, and the canvas is just a replay of both at the current size.
import * as React from "react";
import {
  ArrowUpRight,
  EyeOff,
  Highlighter,
  Pencil,
  Redo2,
  Square,
  Trash2,
  Undo2,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  backingSize,
  canCommit,
  canRedo,
  canUndo,
  clear,
  commit,
  defaultStrokeWidth,
  drawScene,
  fitContain,
  isMeaningful,
  MAX_OPERATIONS,
  pointerToSource,
  redo,
  resolveCssColor,
  simplifyPoints,
  TOOL_INFO,
  TOOLS,
  toolForKey,
  undo,
  type History,
  type Operation,
  type Point,
  type Tool,
} from "@/lib/feedbax/annotation";
import {
  ConfirmBar,
  IconTip,
  R_SM,
  Spinner,
  useIsMac,
  useRoving,
} from "@/components/feedbax/parts";

const TOOL_ICONS: Record<Tool, LucideIcon> = {
  pen: Pencil,
  arrow: ArrowUpRight,
  rectangle: Square,
  highlight: Highlighter,
  redact: EyeOff,
};

/** Colour swatches come from theme tokens. Extra tokens only fill in when two swatches would look alike. */
const SWATCH_CANDIDATES = [
  { key: "primary", label: "Primary colour", className: "bg-primary" },
  { key: "destructive", label: "Alert colour", className: "bg-destructive" },
  { key: "foreground", label: "Text colour", className: "bg-foreground" },
  { key: "chart-2", label: "Muted colour", className: "bg-chart-2" },
  { key: "chart-3", label: "Dark muted colour", className: "bg-chart-3" },
  { key: "ring", label: "Ring colour", className: "bg-ring" },
] as const;
type SwatchKey = (typeof SWATCH_CANDIDATES)[number]["key"];

const colorDistance = (
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);

export type AnnotationEditorProps = {
  source: ImageBitmap | null;
  history: History;
  onHistoryChange: (history: History) => void;
  /** True while the host flattens the picture after "Done". */
  saving?: boolean;
  onCancel: () => void;
  onDone: () => void;
};

export function AnnotationEditor({
  source,
  history,
  onHistoryChange,
  saving = false,
  onCancel,
  onDone,
}: AnnotationEditorProps) {
  const mac = useIsMac();
  const rootRef = React.useRef<HTMLDivElement>(null);
  const stageRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const probes = React.useRef<Partial<Record<SwatchKey, HTMLSpanElement | null>>>({});
  const draftOp = React.useRef<Operation | null>(null);
  const activePointer = React.useRef<number | null>(null);
  const historyRef = React.useRef(history);
  historyRef.current = history;

  const [tool, setTool] = React.useState<Tool>("pen");
  const [swatches, setSwatches] = React.useState<SwatchKey[]>([
    "primary",
    "destructive",
    "foreground",
  ]);
  const [swatch, setSwatch] = React.useState<SwatchKey>("destructive");
  const [size, setSize] = React.useState({ width: 0, height: 0 });
  const [dpr, setDpr] = React.useState(1);
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [limitReached, setLimitReached] = React.useState(false);

  /* Pick three distinct swatches from the theme (re-run when the colour scheme flips). */
  React.useEffect(() => {
    const pick = () => {
      const resolved = SWATCH_CANDIDATES.map((candidate) => {
        const el = probes.current[candidate.key];
        const color = el ? resolveCssColor(getComputedStyle(el).backgroundColor) : null;
        return { key: candidate.key, color: color && color.a > 0 ? color : null };
      });
      const chosen: typeof resolved = [];
      for (const item of resolved) {
        if (!item.color || chosen.length === 3) continue;
        if (chosen.every((c) => colorDistance(c.color!, item.color!) > 60)) chosen.push(item);
      }
      if (chosen.length === 3) setSwatches(chosen.map((c) => c.key));
    };
    pick();
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const observer = new MutationObserver(pick);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"],
    });
    media.addEventListener("change", pick);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", pick);
    };
  }, []);
  React.useEffect(() => {
    if (!swatches.includes(swatch))
      setSwatch(swatches.includes("destructive") ? "destructive" : swatches[0]);
  }, [swatches, swatch]);

  const colorOf = React.useCallback((key: SwatchKey): string => {
    const el = probes.current[key];
    return (el && resolveCssColor(getComputedStyle(el).backgroundColor)?.rgb) || "rgb(220, 38, 38)";
  }, []);

  /* Fit the image into the stage, at the screen's pixel density. */
  React.useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage || !source) return;
    const measure = () => {
      const style = getComputedStyle(stage);
      const w = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const h = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      setSize(fitContain(source.width, source.height, w, h));
      setDpr(window.devicePixelRatio || 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [source]);

  const redraw = React.useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source || size.width === 0) return;
    const backing = backingSize(size.width, size.height, dpr);
    if (canvas.width !== backing.width || canvas.height !== backing.height) {
      canvas.width = backing.width;
      canvas.height = backing.height;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const ops = draftOp.current
      ? [...historyRef.current.ops, draftOp.current]
      : historyRef.current.ops;
    drawScene(ctx, source, ops, {
      x: backing.width / source.width,
      y: backing.height / source.height,
    });
  }, [source, size, dpr]);

  React.useLayoutEffect(redraw, [redraw, history]);

  /* Focus the editor so the shortcuts work immediately. */
  React.useEffect(() => {
    rootRef.current?.focus({ preventScroll: true });
  }, [source]);

  const apply = (next: History) => {
    setLimitReached(false);
    onHistoryChange(next);
  };

  /* ---- pointer input (mouse, touch and pen) ---- */
  const point = (event: { clientX: number; clientY: number }): Point => {
    const canvas = canvasRef.current!;
    return pointerToSource(event.clientX, event.clientY, canvas.getBoundingClientRect(), source!);
  };
  const cssPixel = () => (source && size.width ? source.width / size.width : 1);

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!source || saving || activePointer.current !== null) return;
    if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    if (!canCommit(historyRef.current)) {
      setLimitReached(true);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    activePointer.current = event.pointerId;
    const start = point(event);
    const color = tool === "redact" ? colorOf("foreground") : colorOf(swatch);
    const width = defaultStrokeWidth(source);
    draftOp.current =
      tool === "pen"
        ? { tool, points: [start], color, width }
        : { tool, from: start, to: start, color, width };
    redraw();
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const op = draftOp.current;
    if (!op || event.pointerId !== activePointer.current) return;
    const events = event.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const e of events.length > 0 ? events : [event.nativeEvent]) {
      const next = point(e);
      if (op.tool === "pen") {
        const last = op.points[op.points.length - 1];
        if (Math.hypot(next.x - last.x, next.y - last.y) >= cssPixel()) op.points.push(next);
      } else {
        op.to = next;
      }
    }
    requestAnimationFrame(redraw);
  };

  const finish = (event: React.PointerEvent<HTMLCanvasElement>, cancelled: boolean) => {
    const op = draftOp.current;
    if (!op || event.pointerId !== activePointer.current) return;
    draftOp.current = null;
    activePointer.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (!cancelled && isMeaningful(op, 4 * cssPixel())) {
      const final: Operation =
        op.tool === "pen"
          ? { ...op, points: simplifyPoints(op.points, Math.max(0.5, cssPixel() * 0.6)) }
          : op;
      apply(commit(historyRef.current, final));
    } else {
      redraw();
    }
  };

  /* ---- keyboard ---- */
  const onKeyDown = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable='true']")) return;
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (mod && key === "z") {
      event.preventDefault();
      apply(event.shiftKey ? redo(history) : undo(history));
    } else if (mod && key === "y") {
      event.preventDefault();
      apply(redo(history));
    } else if (!mod && !event.altKey && !event.shiftKey) {
      const match = toolForKey(key);
      if (match) {
        event.preventDefault();
        setTool(match);
      }
    }
  };

  const toolIndex = TOOLS.indexOf(tool);
  const roving = useRoving(TOOLS.length, toolIndex, (i) => setTool(TOOLS[i]));
  const swatchIndex = swatches.indexOf(swatch);
  const swatchRoving = useRoving(swatches.length, swatchIndex, (i) => setSwatch(swatches[i]));
  const modLabel = mac ? "⌘" : "Ctrl+";

  return (
    <TooltipProvider>
      <div
        ref={rootRef}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="relative flex min-h-0 flex-1 flex-col outline-none"
      >
        {/* colour probes: the swatches read their real colours from the host theme */}
        {SWATCH_CANDIDATES.map((candidate) => (
          <span
            key={candidate.key}
            aria-hidden
            ref={(el) => {
              probes.current[candidate.key] = el;
            }}
            className={cn("pointer-events-none absolute size-px opacity-0", candidate.className)}
          />
        ))}

        <div
          role="toolbar"
          aria-label="Annotation tools"
          className="flex flex-wrap items-center gap-x-1 gap-y-2 border-b bg-background px-3 py-2"
        >
          <div role="radiogroup" aria-label="Tool" className="flex items-center gap-0.5">
            {TOOLS.map((t, i) => {
              const { label, key } = TOOL_INFO[t];
              const Icon = TOOL_ICONS[t];
              const selected = t === tool;
              return (
                <IconTip
                  key={t}
                  label={label}
                  shortcut={key}
                  role="radio"
                  aria-checked={selected}
                  variant={selected ? "secondary" : "ghost"}
                  className={cn(selected && "ring-1 ring-ring")}
                  onClick={() => setTool(t)}
                  {...roving(i)}
                >
                  <Icon aria-hidden />
                </IconTip>
              );
            })}
          </div>

          <span aria-hidden className="mx-1.5 hidden h-5 w-px bg-border sm:block" />

          <div
            role="radiogroup"
            aria-label={
              tool === "redact"
                ? "Colour (hide sensitive info always uses the text colour)"
                : "Colour"
            }
            className="flex items-center gap-1.5 px-1"
          >
            {swatches.map((key, i) => {
              const candidate = SWATCH_CANDIDATES.find((c) => c.key === key)!;
              const selected = key === swatch;
              return (
                <IconTip
                  key={key}
                  label={candidate.label}
                  role="radio"
                  aria-checked={selected}
                  variant="ghost"
                  size="icon-sm"
                  disabled={tool === "redact"}
                  className={cn(
                    "rounded-full! p-0",
                    selected && "ring-2 ring-ring ring-offset-2 ring-offset-background",
                  )}
                  onClick={() => setSwatch(key)}
                  {...swatchRoving(i)}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "size-4.5 rounded-full border border-foreground/20",
                      candidate.className,
                    )}
                  />
                </IconTip>
              );
            })}
          </div>

          <span aria-hidden className="mx-1.5 hidden h-5 w-px bg-border sm:block" />

          <div className="flex items-center gap-0.5">
            <IconTip
              label="Undo"
              shortcut={`${modLabel}Z`}
              disabled={!canUndo(history)}
              onClick={() => apply(undo(history))}
            >
              <Undo2 aria-hidden />
            </IconTip>
            <IconTip
              label="Redo"
              shortcut={mac ? "⇧⌘Z" : "Ctrl+Shift+Z"}
              disabled={!canRedo(history)}
              onClick={() => apply(redo(history))}
            >
              <Redo2 aria-hidden />
            </IconTip>
            <IconTip
              label="Clear all"
              disabled={!canUndo(history)}
              onClick={() => setConfirmClear(true)}
            >
              <Trash2 aria-hidden />
            </IconTip>
          </div>

          <p className="ml-auto hidden text-xs text-muted-foreground lg:block" aria-live="polite">
            {limitReached
              ? `You reached the limit of ${MAX_OPERATIONS} marks. Undo one to keep drawing.`
              : TOOL_INFO[tool].hint}
          </p>
        </div>

        <div
          ref={stageRef}
          className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-muted/50 p-3 sm:p-5"
        >
          {source ? (
            <canvas
              ref={canvasRef}
              role="img"
              aria-label="Screenshot. Draw on it with a mouse, finger or pen to point things out."
              style={{ width: size.width, height: size.height, touchAction: "none" }}
              className={cn(
                "block max-h-full max-w-full bg-background shadow-sm ring-1 ring-foreground/10",
                R_SM,
                "cursor-crosshair",
              )}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={(e) => finish(e, false)}
              onPointerCancel={(e) => finish(e, true)}
              onContextMenu={(e) => e.preventDefault()}
            />
          ) : (
            <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> Preparing your screenshot…
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-background px-3 py-2.5">
          <p className="text-xs text-muted-foreground lg:hidden" aria-live="polite">
            {limitReached ? `Limit of ${MAX_OPERATIONS} marks reached.` : TOOL_INFO[tool].hint}
          </p>
          <p className="hidden text-xs text-muted-foreground lg:block">
            {history.ops.length} / {MAX_OPERATIONS} marks · Only the flattened image is sent.
          </p>
          <div className="ml-auto flex items-center gap-2">
            <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" onClick={onDone} disabled={!source || saving}>
              {saving ? (
                <>
                  <Spinner /> Saving…
                </>
              ) : (
                "Done"
              )}
            </Button>
          </div>
        </div>

        {confirmClear ? (
          <ConfirmBar
            title="Clear all marks?"
            description="This removes every mark you drew on this image. You can't undo it afterwards."
            confirmLabel="Clear all"
            cancelLabel="Keep marks"
            destructive
            onCancel={() => {
              setConfirmClear(false);
              rootRef.current?.focus();
            }}
            onConfirm={() => {
              setConfirmClear(false);
              apply(clear(history));
              rootRef.current?.focus();
            }}
          />
        ) : null}
      </div>
    </TooltipProvider>
  );
}
