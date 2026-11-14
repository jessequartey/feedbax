import { LIMITS } from "../contracts/domain.ts";
import { DomainError } from "./errors.ts";

export const MULTIPART_BYTES = LIMITS.images * LIMITS.imageBytes + 65536;
export function requireSameOrigin(request: Request, portalUrl: string): void {
  const site = request.headers.get("sec-fetch-site");
  if (
    request.headers.get("origin") !== new URL(portalUrl).origin ||
    (site !== null && site !== "same-origin")
  )
    throw new DomainError("forbidden", "This origin is not allowed.");
}
/** Read at most max bytes before handing the body to any framework parser. */
export async function boundedBody(request: Request, max: number): Promise<Blob> {
  if (Number(request.headers.get("content-length")) > max)
    throw new DomainError("too_large", "The submission is too large.");
  const reader = request.body?.getReader();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > max) {
          void reader.cancel().catch(() => undefined);
          throw new DomainError("too_large", "The submission is too large.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  return new Blob(chunks, { type: request.headers.get("content-type") ?? "" });
}
