import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { LIMITS } from "../contracts/domain.ts";
import { createDb } from "../db/client.ts";
import { images, posts } from "../db/schema.ts";
import { DomainError } from "./errors.ts";
import { uuid } from "./validation.ts";

type Mime = "image/png" | "image/jpeg" | "image/webp";
export type ValidImage = {
  bytes: Uint8Array<ArrayBuffer>;
  mime: Mime;
  width: number;
  height: number;
};
function unsupported(): never {
  throw new DomainError("unsupported_image", "Use a complete PNG, JPEG or WebP image.", "image");
}
function ascii(bytes: Uint8Array, start: number, length: number) {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}
export async function validateImage(file: File): Promise<ValidImage> {
  if (file.size > LIMITS.imageBytes)
    throw new DomainError("too_large", "Images must be at most 5 MiB.", "image");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);
  let mime: Mime,
    width = 0,
    height = 0;
  if (bytes.length >= 8 && ascii(bytes, 0, 8) === "\x89PNG\r\n\x1a\n") {
    mime = "image/png";
    let offset = 8,
      data = false,
      end = false;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset);
      const type = ascii(bytes, offset + 4, 4);
      if (offset + 12 + length > bytes.length) unsupported();
      if (offset === 8) {
        if (type !== "IHDR" || length !== 13) unsupported();
        width = view.getUint32(offset + 8);
        height = view.getUint32(offset + 12);
        if (
          ![1, 2, 4, 8, 16].includes(bytes[offset + 16]) ||
          ![0, 2, 3, 4, 6].includes(bytes[offset + 17]) ||
          bytes[offset + 18] !== 0 ||
          bytes[offset + 19] !== 0 ||
          bytes[offset + 20] > 1
        )
          unsupported();
      } else if (type === "IHDR") unsupported();
      if (type === "IDAT" && length > 0) data = true;
      offset += length + 12;
      if (type === "IEND") {
        if (length !== 0 || offset !== bytes.length) unsupported();
        end = true;
        break;
      }
    }
    if (!data || !end) unsupported();
  } else if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    mime = "image/jpeg";
    let offset = 2,
      scan = false;
    if (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) unsupported();
    while (offset < bytes.length - 2) {
      if (bytes[offset++] !== 0xff) unsupported();
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (offset + 2 > bytes.length) unsupported();
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length - 2) unsupported();
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        if (length < 8 || length !== 8 + 3 * bytes[offset + 7] || bytes[offset + 2] !== 8)
          unsupported();
        height = view.getUint16(offset + 3);
        width = view.getUint16(offset + 5);
      }
      if (marker === 0xda) {
        scan = length >= 6 && offset + length < bytes.length - 2;
        break;
      }
      offset += length;
    }
    if (!scan) unsupported();
  } else if (bytes.length >= 20 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    mime = "image/webp";
    if (view.getUint32(4, true) + 8 !== bytes.length) unsupported();
    let offset = 12,
      frame = false;
    let canvasWidth: number | undefined, canvasHeight: number | undefined;
    while (offset + 8 <= bytes.length) {
      const type = ascii(bytes, offset, 4),
        length = view.getUint32(offset + 4, true),
        start = offset + 8;
      if (start + length > bytes.length) unsupported();
      if (type === "VP8 " && length > 10) {
        if (frame) unsupported();
        if ((bytes[start] & 1) !== 0 || ascii(bytes, start + 3, 3) !== "\x9d\x01\x2a")
          unsupported();
        width = view.getUint16(start + 6, true) & 0x3fff;
        height = view.getUint16(start + 8, true) & 0x3fff;
        frame = true;
      } else if (type === "VP8L" && length > 5) {
        if (frame) unsupported();
        if (bytes[start] !== 0x2f || bytes[start + 4] >> 5 !== 0) unsupported();
        const bits = view.getUint32(start + 1, true);
        width = (bits & 0x3fff) + 1;
        height = ((bits >>> 14) & 0x3fff) + 1;
        frame = true;
      } else if (type === "VP8X") {
        if (length !== 10 || bytes[start] & 2 || canvasWidth !== undefined) unsupported(); // Animated images are not accepted.
        canvasWidth = 1 + bytes[start + 4] + (bytes[start + 5] << 8) + (bytes[start + 6] << 16);
        canvasHeight = 1 + bytes[start + 7] + (bytes[start + 8] << 8) + (bytes[start + 9] << 16);
        if (
          canvasWidth > LIMITS.imageSide ||
          canvasHeight > LIMITS.imageSide ||
          canvasWidth * canvasHeight > LIMITS.imagePixels
        )
          throw new DomainError("too_large", "The WebP canvas is too large.", "image");
      }
      offset = start + length + (length % 2);
    }
    if (
      !frame ||
      offset !== bytes.length ||
      (canvasWidth !== undefined && (canvasWidth !== width || canvasHeight !== height))
    )
      unsupported();
  } else unsupported();
  if (mime !== file.type || width < 1 || height < 1) unsupported();
  if (width > LIMITS.imageSide || height > LIMITS.imageSide || width * height > LIMITS.imagePixels)
    throw new DomainError(
      "too_large",
      "Images must be at most 4096 px per side and 16 MP.",
      "image",
    );
  return { bytes, mime, width, height };
}
export async function storeImage(
  image: ValidImage,
  postId: string,
  position: number,
  authorId: string,
) {
  const objectKey = `posts/${postId}/${position}`;
  const id = crypto.randomUUID();
  const metadata = {
    authorId,
    imageId: id,
    width: String(image.width),
    height: String(image.height),
    mime: image.mime,
  };
  // First upload wins. This prevents concurrent idempotent requests (including a
  // conflicting author) from overwriting bytes after their D1 batch loses the race.
  const written = await env.IMAGES.put(objectKey, image.bytes, {
    onlyIf: { etagDoesNotMatch: "*" },
    httpMetadata: { contentType: image.mime },
    customMetadata: metadata,
  });
  const object = written ?? (await env.IMAGES.head(objectKey));
  if (!object || object.customMetadata?.authorId !== authorId)
    throw new DomainError("conflict", "This post ID is already in use.");
  const stored = object.customMetadata!;
  return {
    id: stored.imageId,
    postId,
    position,
    objectKey,
    mime: stored.mime as Mime,
    width: Number(stored.width),
    height: Number(stored.height),
    bytes: object.size,
    createdAt: Date.now(),
  };
}
function imageNotFound() {
  return Response.json(
    { error: { code: "not_found", message: "Image not found." } },
    { status: 404, headers: { "Cache-Control": "no-store" } },
  );
}
export async function serveImage(request: Request, id: string): Promise<Response> {
  try {
    uuid(id);
  } catch {
    return imageNotFound();
  }
  const image = await createDb(env.DB)
    .select({ image: images })
    .from(images)
    .innerJoin(posts, eq(posts.id, images.postId))
    .where(eq(images.id, id))
    .get();
  if (!image) return imageNotFound();
  // An image ID always names the same bytes: storeImage is write-once (first upload wins)
  // and nothing deletes images. So the ID is the ETag, the response is immutable, and a
  // revalidation is answered from D1 alone without an R2 read (Class B operation).
  const etag = `"${image.image.id}"`;
  const headers = {
    "Content-Type": image.image.mime,
    "X-Content-Type-Options": "nosniff",
    ETag: etag,
    "Cache-Control": "public, max-age=31536000, immutable",
  };
  const match = request.headers.get("if-none-match");
  if (match && match.split(",").some((value) => value.trim().replace(/^W\//, "") === etag))
    return new Response(null, { status: 304, headers });
  const object = await env.IMAGES.get(image.image.objectKey);
  if (!object) return imageNotFound();
  return new Response(object.body, { headers });
}
