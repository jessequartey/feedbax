// A tiny software 2D canvas: enough to prove what ends up in the exported pixels, with no native dependency.
// It rasterizes fillRect (opacity, scale) and drawImage (nearest-neighbour). Path and stroke calls are recorded only.
export type Rgba = [number, number, number, number];

export class FakeBitmap {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  constructor(width: number, height: number, fill: (x: number, y: number) => Rgba) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) this.data.set(fill(x, y), (y * width + x) * 4);
  }
  close() {}
  pixel(x: number, y: number): Rgba {
    const i = (y * this.width + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }
}

function parseColor(value: string): Rgba {
  const rgb = /^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(value);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), 255];
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value);
  if (hex) return [parseInt(hex[1], 16), parseInt(hex[2], 16), parseInt(hex[3], 16), 255];
  throw new Error(`fake canvas cannot parse colour ${value}`);
}

type State = { sx: number; sy: number; alpha: number; fill: string; composite: string };

export class FakeContext {
  calls: string[] = [];
  fillStyle = "#000000";
  strokeStyle = "#000000";
  lineWidth = 1;
  lineCap = "butt";
  lineJoin = "miter";
  globalAlpha = 1;
  globalCompositeOperation = "source-over";
  imageSmoothingEnabled = true;
  imageSmoothingQuality = "low";
  private sx = 1;
  private sy = 1;
  private stack: State[] = [];
  private canvas: FakeCanvas;
  constructor(canvas: FakeCanvas) {
    this.canvas = canvas;
  }

  save() {
    this.stack.push({
      sx: this.sx,
      sy: this.sy,
      alpha: this.globalAlpha,
      fill: this.fillStyle,
      composite: this.globalCompositeOperation,
    });
  }
  restore() {
    const s = this.stack.pop();
    if (!s) return;
    this.sx = s.sx;
    this.sy = s.sy;
    this.globalAlpha = s.alpha;
    this.fillStyle = s.fill;
    this.globalCompositeOperation = s.composite;
  }
  scale(x: number, y: number) {
    this.sx *= x;
    this.sy *= y;
  }
  setTransform(a: number, _b: number, _c: number, d: number) {
    this.sx = a;
    this.sy = d;
  }
  clearRect(x: number, y: number, w: number, h: number) {
    this.paint(x, y, w, h, [0, 0, 0, 0], 1, true);
  }
  fillRect(x: number, y: number, w: number, h: number) {
    this.calls.push(`fillRect:${this.fillStyle}:${this.globalAlpha}`);
    this.paint(x, y, w, h, parseColor(this.fillStyle), this.globalAlpha, false);
  }
  private paint(
    x: number,
    y: number,
    w: number,
    h: number,
    color: Rgba,
    alpha: number,
    replace: boolean,
  ) {
    const { width, height, data } = this.canvas;
    const x0 = Math.max(0, Math.round(x * this.sx));
    const y0 = Math.max(0, Math.round(y * this.sy));
    const x1 = Math.min(width, Math.round((x + w) * this.sx));
    const y1 = Math.min(height, Math.round((y + h) * this.sy));
    for (let py = y0; py < y1; py++)
      for (let px = x0; px < x1; px++) {
        const i = (py * width + px) * 4;
        if (replace) data.set(color, i);
        else
          for (let c = 0; c < 3; c++)
            data[i + c] = Math.round(color[c] * alpha + data[i + c] * (1 - alpha));
        if (!replace) data[i + 3] = Math.round(255 * alpha + data[i + 3] * (1 - alpha));
      }
  }
  drawImage(src: FakeBitmap | FakeCanvas, dx = 0, dy = 0, dw?: number, dh?: number) {
    const w = dw ?? src.width;
    const h = dh ?? src.height;
    const { width, data } = this.canvas;
    const x0 = Math.round(dx * this.sx);
    const y0 = Math.round(dy * this.sy);
    const pw = Math.round(w * this.sx);
    const ph = Math.round(h * this.sy);
    for (let py = 0; py < ph; py++)
      for (let px = 0; px < pw; px++) {
        const tx = x0 + px;
        const ty = y0 + py;
        if (tx < 0 || ty < 0 || tx >= width || ty >= this.canvas.height) continue;
        const sx = Math.min(src.width - 1, Math.floor((px / pw) * src.width));
        const sy = Math.min(src.height - 1, Math.floor((py / ph) * src.height));
        data.set(
          src.data.subarray((sy * src.width + sx) * 4, (sy * src.width + sx) * 4 + 4),
          (ty * width + tx) * 4,
        );
      }
  }
  // Path drawing is not rasterized: recorded so tests can assert the tool ran.
  beginPath() {}
  closePath() {}
  moveTo() {}
  lineTo() {}
  quadraticCurveTo() {}
  arc() {}
  fill() {
    this.calls.push("fill");
  }
  stroke() {
    this.calls.push("stroke");
  }
  strokeRect() {
    this.calls.push("strokeRect");
  }
}

export type Encoder = (type: string, quality: number | undefined, canvas: FakeCanvas) => Blob;

export class FakeCanvas {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  private ctx: FakeContext;
  static encoder: Encoder = (type, _q, canvas) => new Blob([canvas.data as BlobPart], { type });
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
    this.ctx = new FakeContext(this);
  }
  getContext() {
    return this.ctx;
  }
  convertToBlob({ type, quality }: { type: string; quality?: number }) {
    return Promise.resolve(FakeCanvas.encoder(type, quality, this));
  }
  pixel(x: number, y: number): Rgba {
    const i = (y * this.width + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }
}
