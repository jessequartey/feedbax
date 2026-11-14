// Decoding and size limits for attached images. Browser only.
import { LIMITS } from "./types";

export const ACCEPT_ATTRIBUTE = "image/png,image/jpeg,image/webp";
export type AcceptedMime = "image/png" | "image/jpeg" | "image/webp";

export class ImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageError";
  }
}

/** Reads the magic bytes: the declared MIME type of a pasted or dropped file is not always right. */
export async function sniffImageType(blob: Blob): Promise<AcceptedMime | null> {
  const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47)
    return "image/png";
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "image/jpeg";
  const riff = String.fromCharCode(...head.slice(0, 4)) === "RIFF";
  if (riff && String.fromCharCode(...head.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

/** Largest size within 4096 px per side and 16 megapixels, keeping the aspect ratio. */
export function limitSize(width: number, height: number) {
  const scale = Math.min(
    1,
    LIMITS.imageSide / Math.max(width, height),
    Math.sqrt(LIMITS.imagePixels / (width * height)),
  );
  return scale >= 1
    ? { width, height, scaled: false }
    : {
        width: Math.max(1, Math.floor(width * scale)),
        height: Math.max(1, Math.floor(height * scale)),
        scaled: true,
      };
}

/** Decodes a PNG/JPEG/WebP file to a bitmap, honouring EXIF rotation and downscaling oversized images. */
export async function decodeImage(blob: Blob): Promise<ImageBitmap> {
  if (!(await sniffImageType(blob))) throw new ImageError("Use a PNG, JPEG or WebP image.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  } catch {
    throw new ImageError("That image could not be read. Try another file.");
  }
  const size = limitSize(bitmap.width, bitmap.height);
  if (!size.scaled) return bitmap;
  const resized = await createImageBitmap(bitmap, {
    resizeWidth: size.width,
    resizeHeight: size.height,
    resizeQuality: "high",
  });
  bitmap.close();
  return resized;
}

/** Image files from a paste or drop event, in order. */
export function imageFilesFrom(items: DataTransfer | null): File[] {
  if (!items) return [];
  const files = Array.from(items.files).filter((file) => file.type.startsWith("image/"));
  if (files.length > 0) return files;
  return Array.from(items.items ?? [])
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
}
