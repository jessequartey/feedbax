// Image attachments: screening, and browser-side normalisation through a canvas (spec §6).
// The server re-validates everything. This only strips metadata and keeps uploads small.
import { LIMITS } from "@/contracts/domain";

export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const MAX_EDGE = 2560;
/** Raw files may be larger than the upload limit: they are re-encoded smaller. */
export const MAX_SOURCE_BYTES = 30 * 1024 * 1024;

export type Rejection = { name: string; reason: string };

export function fitWithin(width: number, height: number, max = MAX_EDGE) {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function screenIncoming<T extends { name: string; type: string; size: number }>(
  files: readonly T[],
  existing: number,
): { accepted: T[]; rejected: Rejection[] } {
  const accepted: T[] = [];
  const rejected: Rejection[] = [];
  for (const file of files) {
    if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      rejected.push({ name: file.name, reason: "Only PNG, JPEG or WebP images are allowed." });
    } else if (file.size > MAX_SOURCE_BYTES) {
      rejected.push({ name: file.name, reason: "That file is too large." });
    } else if (file.size === 0) {
      rejected.push({ name: file.name, reason: "That file is empty." });
    } else if (existing + accepted.length >= LIMITS.images) {
      rejected.push({ name: file.name, reason: `You can attach up to ${LIMITS.images} images.` });
    } else {
      accepted.push(file);
    }
  }
  return { accepted, rejected };
}

export function extensionFor(type: string): string {
  return type === "image/jpeg" ? "jpg" : type === "image/webp" ? "webp" : "png";
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export type NormalizedImage = { blob: Blob; width: number; height: number };

export async function normalizeImage(file: Blob): Promise<NormalizedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("That image couldn't be read.");
  }
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    if (width * height > LIMITS.imagePixels) throw new Error("That image is too large.");
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("That image couldn't be processed.");
    ctx.drawImage(bitmap, 0, 0, width, height);

    // Same format first. If it is still over the limit, step down in quality, then try WebP.
    const attempts: [string, number | undefined][] =
      file.type === "image/png"
        ? [
            ["image/png", undefined],
            ["image/webp", 0.9],
            ["image/webp", 0.75],
            ["image/webp", 0.6],
          ]
        : [
            [file.type, 0.9],
            [file.type, 0.75],
            [file.type, 0.6],
          ];
    for (const [type, quality] of attempts) {
      const blob = await toBlob(canvas, type, quality);
      if (blob && blob.type === type && blob.size <= LIMITS.imageBytes) {
        return { blob, width, height };
      }
    }
    throw new Error("That image is too large, even after shrinking it.");
  } finally {
    bitmap.close();
  }
}
