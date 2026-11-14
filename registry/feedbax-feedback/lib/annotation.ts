// Pure canvas annotation engine: operations, command history, geometry and export. No React.
// Every coordinate is stored in SOURCE-image pixels, so replaying the operations on any canvas size
// (screen, HiDPI, export) draws the same picture.
import { LIMITS } from "./types";

export type Point = { x: number; y: number };
export type Operation =
  | { tool: "pen"; points: Point[]; color: string; width: number }
  | {
      tool: "arrow" | "rectangle" | "highlight" | "redact";
      from: Point;
      to: Point;
      color: string;
      width: number;
    };
export type Tool = Operation["tool"];

export const TOOLS: readonly Tool[] = ["pen", "arrow", "rectangle", "highlight", "redact"];
/** Accessible names, keyboard shortcuts and hints for the tools. The editor adds the icons. */
export const TOOL_INFO: Record<Tool, { label: string; key: string; hint: string }> = {
  pen: { label: "Pen", key: "P", hint: "Draw freehand." },
  arrow: { label: "Arrow", key: "A", hint: "Drag to point at something." },
  rectangle: { label: "Rectangle", key: "R", hint: "Drag to outline an area." },
  highlight: { label: "Highlight", key: "H", hint: "Drag to highlight an area." },
  redact: {
    label: "Hide sensitive info",
    key: "X",
    hint: "Drag over anything private. It is permanently covered in the image you send.",
  },
};

/** The tool a plain key press selects (P A R H X), or null. */
export function toolForKey(key: string): Tool | null {
  const upper = key.toUpperCase();
  return TOOLS.find((tool) => TOOL_INFO[tool].key === upper) ?? null;
}

export const MAX_OPERATIONS = 200;
export const MAX_PEN_POINTS = 1500;
export const HIGHLIGHT_ALPHA = 0.35;
/** Longest edge of the image we upload. The portal accepts 4096, this keeps files small. */
export const EXPORT_MAX_SIDE = 2560;

/* ------------------------------------------------------------------------------------------ *
 * Command history: immutable, replayable. `ops` is what is drawn, `undone` is the redo stack.
 * ------------------------------------------------------------------------------------------ */

export type History = { readonly ops: readonly Operation[]; readonly undone: readonly Operation[] };

export const emptyHistory: History = { ops: [], undone: [] };

export const canCommit = (h: History) => h.ops.length < MAX_OPERATIONS;
export const canUndo = (h: History) => h.ops.length > 0;
export const canRedo = (h: History) => h.undone.length > 0;

/** Adds an operation and drops the redo stack. At the operation limit the history is returned as is. */
export function commit(h: History, op: Operation): History {
  if (!canCommit(h)) return h;
  return { ops: [...h.ops, op], undone: [] };
}
export function undo(h: History): History {
  const last = h.ops[h.ops.length - 1];
  return last ? { ops: h.ops.slice(0, -1), undone: [...h.undone, last] } : h;
}
export function redo(h: History): History {
  const next = h.undone[h.undone.length - 1];
  return next ? { ops: [...h.ops, next], undone: h.undone.slice(0, -1) } : h;
}
export function clear(h: History): History {
  return h.ops.length === 0 && h.undone.length === 0 ? h : emptyHistory;
}

/* ------------------------------------------------------------------------------------------ *
 * Geometry
 * ------------------------------------------------------------------------------------------ */

export function normalizeRect(from: Point, to: Point) {
  const x = Math.min(from.x, to.x);
  const y = Math.min(from.y, to.y);
  return { x, y, width: Math.abs(to.x - from.x), height: Math.abs(to.y - from.y) };
}

/** Largest size with the source's aspect ratio that fits in the box (never upscales past 1:1 when `allowUpscale` is false). */
export function fitContain(
  srcW: number,
  srcH: number,
  maxW: number,
  maxH: number,
  allowUpscale = false,
) {
  if (srcW <= 0 || srcH <= 0 || maxW <= 0 || maxH <= 0) return { width: 0, height: 0 };
  const scale = Math.min(maxW / srcW, maxH / srcH, allowUpscale ? Infinity : 1);
  return {
    width: Math.max(1, Math.round(srcW * scale)),
    height: Math.max(1, Math.round(srcH * scale)),
  };
}

/** Backing-store size for a canvas that is `cssW × cssH` CSS pixels on a screen with this devicePixelRatio. */
export function backingSize(cssW: number, cssH: number, dpr: number) {
  const ratio = dpr > 0 ? dpr : 1;
  return {
    width: Math.max(1, Math.round(cssW * ratio)),
    height: Math.max(1, Math.round(cssH * ratio)),
  };
}

/** Maps a pointer position to source-image pixels. Independent of devicePixelRatio: only CSS geometry matters. */
export function pointerToSource(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  source: { width: number; height: number },
): Point {
  const x = ((clientX - rect.left) / rect.width) * source.width;
  const y = ((clientY - rect.top) / rect.height) * source.height;
  return {
    x: Math.min(source.width, Math.max(0, x)),
    y: Math.min(source.height, Math.max(0, y)),
  };
}

/** A stroke width that looks the same on a 800 px and a 4000 px image. */
export function defaultStrokeWidth(source: { width: number; height: number }): number {
  return Math.min(14, Math.max(3, Math.round(Math.max(source.width, source.height) / 320)));
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

function perpendicularDistance(p: Point, a: Point, b: Point): number {
  const length = distance(a, b);
  if (length === 0) return distance(p, a);
  return Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / length;
}

/** Ramer–Douglas–Peucker, iterative so a long scribble cannot overflow the stack. */
export function simplifyPoints(points: readonly Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop() as [number, number];
    let farthest = -1;
    let max = epsilon;
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistance(points[i], points[start], points[end]);
      if (d > max) {
        max = d;
        farthest = i;
      }
    }
    if (farthest !== -1) {
      keep[farthest] = 1;
      stack.push([start, farthest], [farthest, end]);
    }
  }
  const result = points.filter((_, i) => keep[i] === 1);
  if (result.length <= MAX_PEN_POINTS) return result;
  const step = Math.ceil(result.length / MAX_PEN_POINTS);
  return result.filter((_, i) => i % step === 0 || i === result.length - 1);
}

/** Drops tap-sized shapes so a stray click never becomes an annotation. */
export function isMeaningful(op: Operation, minSize: number): boolean {
  if (op.tool === "pen") return op.points.length >= 2 || op.points.length === 1;
  return distance(op.from, op.to) >= minSize;
}

/* ------------------------------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------------------------------ */

type PenOperation = Extract<Operation, { tool: "pen" }>;

function drawPen(ctx: CanvasRenderingContext2D, op: PenOperation) {
  const { points } = op;
  if (points.length === 0) return;
  ctx.strokeStyle = op.color;
  ctx.fillStyle = op.color;
  ctx.lineWidth = op.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (points.length === 1) {
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, op.width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  // Quadratic curves through the midpoints of consecutive points give a smooth line.
  for (let i = 1; i < points.length - 1; i++) {
    const mid = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 };
    ctx.quadraticCurveTo(points[i].x, points[i].y, mid.x, mid.y);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

type ShapeOperation = Exclude<Operation, { tool: "pen" }>;

function drawArrow(ctx: CanvasRenderingContext2D, op: ShapeOperation) {
  const { from, to } = op;
  const length = distance(from, to);
  if (length === 0) return;
  const ux = (to.x - from.x) / length;
  const uy = (to.y - from.y) / length;
  const head = Math.min(Math.max(op.width * 4.5, 14), length * 0.7);
  const baseX = to.x - ux * head * 0.8;
  const baseY = to.y - uy * head * 0.8;
  ctx.strokeStyle = op.color;
  ctx.fillStyle = op.color;
  ctx.lineWidth = op.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(baseX, baseY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - ux * head + -uy * head * 0.45, to.y - uy * head + ux * head * 0.45);
  ctx.lineTo(to.x - ux * head - -uy * head * 0.45, to.y - uy * head - ux * head * 0.45);
  ctx.closePath();
  ctx.fill();
}

/** Draws operations in order. Safe to call repeatedly: every operation saves and restores the context. */
export function renderOperations(ctx: CanvasRenderingContext2D, ops: readonly Operation[]): void {
  for (const op of ops) {
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    switch (op.tool) {
      case "pen":
        drawPen(ctx, op);
        break;
      case "arrow":
        drawArrow(ctx, op);
        break;
      case "rectangle": {
        const r = normalizeRect(op.from, op.to);
        ctx.strokeStyle = op.color;
        ctx.lineWidth = op.width;
        ctx.lineJoin = "round";
        ctx.strokeRect(r.x, r.y, r.width, r.height);
        break;
      }
      case "highlight": {
        const r = normalizeRect(op.from, op.to);
        ctx.globalAlpha = HIGHLIGHT_ALPHA;
        ctx.fillStyle = op.color;
        ctx.fillRect(r.x, r.y, r.width, r.height);
        break;
      }
      case "redact": {
        // Fully opaque: whatever was under this rectangle is gone from the flattened image.
        const r = normalizeRect(op.from, op.to);
        ctx.fillStyle = op.color;
        ctx.fillRect(r.x, r.y, r.width, r.height);
        break;
      }
    }
    ctx.restore();
  }
}

/** Draws the source bitmap and its operations scaled by `scale` (display pixels per source pixel). */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource & { width: number; height: number },
  ops: readonly Operation[],
  scale: { x: number; y: number },
): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, source.width * scale.x, source.height * scale.y);
  ctx.setTransform(scale.x, 0, 0, scale.y, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0);
  renderOperations(ctx, ops);
  ctx.restore();
}

/* ------------------------------------------------------------------------------------------ *
 * Export: flatten once, encode once. Only these pixels ever leave the browser.
 * ------------------------------------------------------------------------------------------ */

export type CanvasLike = HTMLCanvasElement | OffscreenCanvas;
export type ExportOptions = {
  maxSide?: number;
  maxBytes?: number;
  createCanvas?: (width: number, height: number) => CanvasLike;
};

export function createCanvas(width: number, height: number): CanvasLike {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function canvasToBlob(
  canvas: CanvasLike,
  type: string,
  quality?: number,
): Promise<Blob | null> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type, quality }).catch(() => null);
  return new Promise((resolve) => (canvas as HTMLCanvasElement).toBlob(resolve, type, quality));
}

/** Draws the source and every operation onto a fresh canvas of the given size. */
export function flatten(
  source: { width: number; height: number } & CanvasImageSource,
  ops: readonly Operation[],
  width: number,
  height: number,
  make: (w: number, h: number) => CanvasLike = createCanvas,
): CanvasLike {
  const canvas = make(width, height);
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | null;
  if (!ctx) throw new Error("Canvas 2D is not available in this browser.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);
  ctx.save();
  ctx.scale(width / source.width, height / source.height);
  renderOperations(ctx, ops);
  ctx.restore();
  return canvas;
}

/**
 * Flattens the picture and its operations into one PNG (WebP when a PNG would be over 5 MiB).
 * The bitmap and the operation list stay in the browser. Redact rectangles are plain opaque pixels here.
 */
export async function exportImage(
  source: ImageBitmap,
  ops: readonly Operation[],
  options: ExportOptions = {},
): Promise<Blob> {
  const maxSide = options.maxSide ?? EXPORT_MAX_SIDE;
  const maxBytes = options.maxBytes ?? LIMITS.imageBytes;
  const make = options.createCanvas ?? createCanvas;
  let shrink = Math.min(1, maxSide / Math.max(source.width, source.height));

  for (let round = 0; round < 5; round++) {
    const width = Math.max(1, Math.round(source.width * shrink));
    const height = Math.max(1, Math.round(source.height * shrink));
    const canvas = flatten(source, ops, width, height, make);
    const png = await canvasToBlob(canvas, "image/png");
    if (png && png.type === "image/png" && png.size <= maxBytes) return png;
    for (const quality of [0.92, 0.8, 0.65]) {
      const webp = await canvasToBlob(canvas, "image/webp", quality);
      if (webp && webp.type === "image/webp" && webp.size <= maxBytes) return webp;
    }
    shrink *= 0.75;
  }
  throw new Error("This image is too large to send. Try a smaller screenshot.");
}

/* ------------------------------------------------------------------------------------------ *
 * Theme colours
 * ------------------------------------------------------------------------------------------ */

/** Converts any CSS colour the browser understands (oklch, hsl, rgb, …) to an opaque `rgb()` string. */
export function resolveCssColor(
  css: string,
): { rgb: string; r: number; g: number; b: number; a: number } | null {
  const canvas = createCanvas(1, 1);
  const ctx = canvas.getContext("2d", {
    willReadFrequently: true,
  }) as CanvasRenderingContext2D | null;
  if (!ctx) return null;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = "#000";
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return { rgb: `rgb(${r}, ${g}, ${b})`, r, g, b, a };
}
