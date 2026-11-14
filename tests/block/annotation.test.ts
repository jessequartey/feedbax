import { beforeEach, describe, expect, test } from "vite-plus/test";
import {
  backingSize,
  canCommit,
  canRedo,
  canUndo,
  clear,
  commit,
  defaultStrokeWidth,
  emptyHistory,
  exportImage,
  fitContain,
  flatten,
  isMeaningful,
  MAX_OPERATIONS,
  pointerToSource,
  redo,
  renderOperations,
  simplifyPoints,
  undo,
  type Operation,
  type Point,
} from "../../registry/feedbax-feedback/lib/annotation.ts";
import { FakeBitmap, FakeCanvas, type Rgba } from "./fake-canvas.ts";

const rect = (
  tool: "rectangle" | "highlight" | "redact" | "arrow",
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color = "rgb(10, 20, 30)",
): Operation => ({
  tool,
  from: { x: x1, y: y1 },
  to: { x: x2, y: y2 },
  color,
  width: 4,
});
const pen = (points: Point[]): Operation => ({
  tool: "pen",
  points,
  color: "rgb(1, 2, 3)",
  width: 4,
});
// Every source pixel is distinct, so a leak of the original would be visible.
const source = (seed = 0, w = 200, h = 120) =>
  new FakeBitmap(w, h, (x, y): Rgba => [
    (x * 7 + seed) % 256,
    (y * 13 + seed) % 256,
    (x + y + seed * 3) % 256,
    255,
  ]);
const make = (w: number, h: number) => new FakeCanvas(w, h) as unknown as HTMLCanvasElement;
const asBitmap = (b: FakeBitmap) => b as unknown as ImageBitmap;

describe("command history", () => {
  const a = rect("rectangle", 0, 0, 10, 10);
  const b = pen([
    { x: 1, y: 1 },
    { x: 5, y: 5 },
  ]);
  const c = rect("redact", 2, 2, 8, 8);

  test("commit, undo and redo replay in order", () => {
    let h = emptyHistory;
    expect(canUndo(h) || canRedo(h)).toBe(false);
    h = commit(commit(commit(h, a), b), c);
    expect(h.ops).toEqual([a, b, c]);
    h = undo(undo(h));
    expect(h.ops).toEqual([a]);
    expect(canRedo(h)).toBe(true);
    h = redo(h);
    expect(h.ops).toEqual([a, b]);
    h = redo(redo(h)); // the second redo restores c; a third would be a no-op
    expect(h.ops).toEqual([a, b, c]);
    expect(redo(h)).toBe(h);
  });

  test("a new operation after an undo drops the redo stack", () => {
    let h = commit(commit(emptyHistory, a), b);
    h = undo(h);
    h = commit(h, c);
    expect(h.ops).toEqual([a, c]);
    expect(canRedo(h)).toBe(false);
  });

  test("history values are immutable", () => {
    const h1 = commit(emptyHistory, a);
    const h2 = commit(h1, b);
    undo(h2);
    expect(h1.ops).toEqual([a]);
    expect(h2.ops).toEqual([a, b]);
    expect(emptyHistory.ops).toEqual([]);
  });

  test("undo and clear on an empty history change nothing", () => {
    expect(undo(emptyHistory)).toBe(emptyHistory);
    expect(clear(emptyHistory)).toBe(emptyHistory);
  });

  test("clear removes everything, including the redo stack", () => {
    const h = clear(undo(commit(commit(emptyHistory, a), b)));
    expect(h).toEqual({ ops: [], undone: [] });
  });

  test("stops accepting operations at the limit of 200", () => {
    let h = emptyHistory;
    for (let i = 0; i < MAX_OPERATIONS + 20; i++) h = commit(h, rect("rectangle", i, 0, i + 5, 5));
    expect(h.ops).toHaveLength(MAX_OPERATIONS);
    expect(canCommit(h)).toBe(false);
    expect(commit(h, a)).toBe(h);
    expect(canCommit(undo(h))).toBe(true);
  });
});

describe("geometry", () => {
  test("fitContain keeps the aspect ratio and never upscales by default", () => {
    expect(fitContain(2000, 1000, 500, 500)).toEqual({ width: 500, height: 250 });
    expect(fitContain(300, 200, 1000, 1000)).toEqual({ width: 300, height: 200 });
    expect(fitContain(300, 200, 1000, 1000, true)).toEqual({ width: 1000, height: 667 });
    expect(fitContain(0, 0, 10, 10)).toEqual({ width: 0, height: 0 });
  });

  test("backingSize multiplies by the device pixel ratio", () => {
    expect(backingSize(500, 250, 1)).toEqual({ width: 500, height: 250 });
    expect(backingSize(500, 250, 2)).toEqual({ width: 1000, height: 500 });
    expect(backingSize(333, 111, 1.5)).toEqual({ width: 500, height: 167 });
    expect(backingSize(10, 10, 0)).toEqual({ width: 10, height: 10 });
  });

  test("pointer coordinates map to source pixels on high-DPI screens", () => {
    // 4000×2000 source shown at 500×250 CSS px on a 2x display (1000×500 backing store).
    const src = { width: 4000, height: 2000 };
    const css = { left: 100, top: 50, width: 500, height: 250 };
    expect(pointerToSource(100, 50, css, src)).toEqual({ x: 0, y: 0 });
    expect(pointerToSource(350, 175, css, src)).toEqual({ x: 2000, y: 1000 });
    expect(pointerToSource(600, 300, css, src)).toEqual({ x: 4000, y: 2000 });
    // The backing store ratio plays no part: only CSS geometry does.
    const backing = backingSize(css.width, css.height, 2);
    expect(backing.width / src.width).toBe(0.25);
  });

  test("the same point maps to the same source pixel after a resize", () => {
    const src = { width: 1600, height: 800 };
    const before = { left: 0, top: 0, width: 800, height: 400 };
    const after = { left: 40, top: 20, width: 400, height: 200 }; // dialog shrank to half size
    const p = pointerToSource(600, 100, before, src); // 75% across, 25% down
    const q = pointerToSource(40 + 300, 20 + 50, after, src);
    expect(q).toEqual(p);
    expect(p).toEqual({ x: 1200, y: 200 });
  });

  test("points outside the canvas are clamped", () => {
    expect(
      pointerToSource(
        -50,
        9999,
        { left: 0, top: 0, width: 100, height: 100 },
        { width: 10, height: 10 },
      ),
    ).toEqual({ x: 0, y: 10 });
  });

  test("stroke width scales with the image but stays in a sane range", () => {
    expect(defaultStrokeWidth({ width: 800, height: 600 })).toBe(3);
    expect(defaultStrokeWidth({ width: 2560, height: 1440 })).toBe(8);
    expect(defaultStrokeWidth({ width: 4096, height: 4096 })).toBe(13);
    expect(defaultStrokeWidth({ width: 100, height: 100 })).toBe(3);
  });

  test("simplifyPoints keeps the corners of a polyline and drops collinear points", () => {
    const line = Array.from({ length: 50 }, (_, i): Point => ({ x: i, y: 0 }));
    const corner = [...line, ...Array.from({ length: 50 }, (_, i): Point => ({ x: 49, y: i + 1 }))];
    const out = simplifyPoints(corner, 0.5);
    expect(out[0]).toEqual({ x: 0, y: 0 });
    expect(out.at(-1)).toEqual({ x: 49, y: 50 });
    expect(out).toContainEqual({ x: 49, y: 0 });
    expect(out.length).toBeLessThanOrEqual(4);
  });

  test("tap-sized shapes are not annotations", () => {
    expect(isMeaningful(rect("rectangle", 5, 5, 6, 6), 4)).toBe(false);
    expect(isMeaningful(rect("rectangle", 5, 5, 50, 50), 4)).toBe(true);
    expect(isMeaningful(pen([{ x: 1, y: 1 }]), 4)).toBe(true); // a dot
  });
});

describe("rendering and export", () => {
  beforeEach(() => {
    FakeCanvas.encoder = (type, _q, canvas) => new Blob([canvas.data as BlobPart], { type });
  });

  test("redact replaces the pixels with the opaque fill and nothing else shows through", () => {
    const ops = [rect("redact", 40, 30, 120, 70, "rgb(10, 20, 30)")];
    const a = flatten(asBitmap(source(0)), ops, 200, 120, make) as unknown as FakeCanvas;
    const b = flatten(asBitmap(source(99)), ops, 200, 120, make) as unknown as FakeCanvas;
    for (let y = 30; y < 70; y++)
      for (let x = 40; x < 120; x++) {
        expect(a.pixel(x, y)).toEqual([10, 20, 30, 255]);
        // Two different originals give identical pixels inside the rectangle: the original is gone.
        expect(b.pixel(x, y)).toEqual(a.pixel(x, y));
      }
    // Outside the rectangle the picture is untouched.
    expect(a.pixel(10, 10)).toEqual(source(0).pixel(10, 10));
    expect(a.pixel(150, 100)).toEqual(source(0).pixel(150, 100));
    expect(a.pixel(39, 50)).toEqual(source(0).pixel(39, 50));
    expect(a.pixel(120, 50)).toEqual(source(0).pixel(120, 50));
  });

  test("redact is drawn at full opacity even after a translucent highlight", () => {
    const ctx = new FakeCanvas(10, 10).getContext();
    renderOperations(ctx as unknown as CanvasRenderingContext2D, [
      rect("highlight", 0, 0, 5, 5),
      rect("redact", 0, 0, 5, 5),
    ]);
    expect(ctx.calls).toEqual(["fillRect:rgb(10, 20, 30):0.35", "fillRect:rgb(10, 20, 30):1"]);
  });

  test("redact works when the export is scaled down", async () => {
    FakeCanvas.encoder = (type, _q, canvas) => new Blob([canvas.data as BlobPart], { type });
    const captured: FakeCanvas[] = [];
    const blob = await exportImage(
      asBitmap(source(5, 400, 240)),
      [rect("redact", 100, 60, 300, 180, "rgb(9, 9, 9)")],
      {
        maxSide: 200, // 400×240 → 200×120
        createCanvas: (w, h) => {
          const canvas = new FakeCanvas(w, h);
          captured.push(canvas);
          return canvas as unknown as HTMLCanvasElement;
        },
      },
    );
    const out = captured.at(-1)!;
    expect([out.width, out.height]).toEqual([200, 120]);
    expect(blob.type).toBe("image/png");
    for (let y = 32; y < 88; y++)
      for (let x = 52; x < 148; x++) expect(out.pixel(x, y)).toEqual([9, 9, 9, 255]);
  });

  test("the exported blob is plain pixels: no operation history inside it", async () => {
    const ops = [
      rect("redact", 0, 0, 10, 10),
      pen([
        { x: 0, y: 0 },
        { x: 20, y: 20 },
      ]),
    ];
    const blob = await exportImage(asBitmap(source()), ops, { createCanvas: make });
    const text = Buffer.from(await blob.arrayBuffer()).toString("latin1");
    expect(text).not.toContain("redact");
    expect(text).not.toContain("points");
    expect(blob).toBeInstanceOf(Blob);
  });

  test("every tool draws something", () => {
    const ctx = new FakeCanvas(50, 50).getContext();
    const ops = [
      pen([
        { x: 0, y: 0 },
        { x: 3, y: 3 },
        { x: 9, y: 4 },
      ]),
      rect("arrow", 1, 1, 40, 40),
      rect("rectangle", 2, 2, 20, 20),
      rect("highlight", 1, 1, 9, 9),
      rect("redact", 3, 3, 8, 8),
    ];
    renderOperations(ctx as unknown as CanvasRenderingContext2D, ops);
    expect(ctx.calls).toEqual(expect.arrayContaining(["stroke", "fill", "strokeRect"]));
    expect(ctx.calls.filter((c) => c.startsWith("fillRect")).length).toBe(2);
  });

  test("falls back to WebP when a PNG is over the byte limit", async () => {
    FakeCanvas.encoder = (type) =>
      new Blob([new Uint8Array(type === "image/png" ? 600 : 100)], { type });
    const blob = await exportImage(asBitmap(source()), [], { createCanvas: make, maxBytes: 500 });
    expect(blob.type).toBe("image/webp");
    expect(blob.size).toBe(100);
  });

  test("shrinks the image when even WebP is too big, then gives up with a clear error", async () => {
    const sizes: number[] = [];
    FakeCanvas.encoder = (type, _q, canvas) => {
      sizes.push(canvas.width);
      return new Blob([new Uint8Array(canvas.width < 150 ? 10 : 1000)], { type });
    };
    const blob = await exportImage(asBitmap(source(0, 200, 120)), [], {
      createCanvas: make,
      maxBytes: 500,
    });
    expect(blob.size).toBe(10);
    expect(Math.min(...sizes)).toBeLessThan(150);

    FakeCanvas.encoder = (type) => new Blob([new Uint8Array(1_000_000)], { type });
    await expect(
      exportImage(asBitmap(source()), [], { createCanvas: make, maxBytes: 500 }),
    ).rejects.toThrow(/too large/);
  });

  test("a browser that cannot encode WebP (returns PNG) is not mistaken for WebP", async () => {
    FakeCanvas.encoder = (_type) => new Blob([new Uint8Array(600)], { type: "image/png" });
    await expect(
      exportImage(asBitmap(source()), [], { createCanvas: make, maxBytes: 500 }),
    ).rejects.toThrow();
  });
});
