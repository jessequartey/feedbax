import {
  ImageAttachmentError,
  type createImageModule,
} from "@feedbax/feedback";
import { env } from "cloudflare:workers";
import feedbax from "./feedbax";
import {
  configuredImages,
  createConfiguredFeedbackModule,
  requestParticipant,
} from "./feedback-runtime";
import { sameOrigin } from "./connected-identity";

export function createImageRequestHandler(options: {
  enabled: boolean;
  siteUrl: string;
  getImages(request: Request): Promise<ReturnType<typeof createImageModule>>;
  signedIn(request: Request): Promise<boolean>;
  rateLimit(request: Request): Promise<boolean>;
}) {
  return async (request: Request): Promise<Response | undefined> => {
    const url = new URL(request.url);
    if (
      url.pathname !== "/internal/images" &&
      !url.pathname.startsWith("/internal/images/")
    )
      return;
    const json = (body: unknown, status = 200) =>
      Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
    if (!options.enabled) return json({ error: "Not found." }, 404);
    const id = url.pathname.slice("/internal/images/".length);
    try {
      if (request.method === "GET" && /^[-a-f0-9]{36}$/.test(id)) {
        const image = await (
          await options.getImages(request)
        ).read(id, url.searchParams.get("review") ?? undefined);
        if (!image) return json({ error: "Image is unavailable." }, 404);
        return new Response(image.body as BodyInit, {
          headers: {
            "Content-Type": image.contentType,
            "Content-Length": String(image.bytes),
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
            "Cross-Origin-Resource-Policy": "same-origin",
            "Referrer-Policy": "no-referrer",
          },
        });
      }
      if (request.method !== "POST" && request.method !== "DELETE")
        return json({ error: "Method not allowed." }, 405);
      if (!sameOrigin(request, options.siteUrl))
        return json({ error: "Request origin is invalid." }, 403);
      if (!(await options.signedIn(request)))
        return json({ error: "Sign in to add images." }, 401);
      if (!(await options.rateLimit(request)))
        return json(
          { error: "Too many image requests. Try again shortly." },
          429,
        );
      const images = await options.getImages(request);
      if (request.method === "DELETE") {
        if (!/^[-a-f0-9]{36}$/.test(id))
          return json({ error: "Invalid image." }, 400);
        await images.removePending(id);
        return json({ removed: true });
      }
      if (url.pathname !== "/internal/images")
        return json({ error: "Not found." }, 404);
      const type = request.headers.get("Content-Type") ?? "";
      if (!["image/jpeg", "image/png", "image/webp"].includes(type))
        return json({ error: "Choose a JPEG, PNG, or WebP image." }, 400);
      const max = 5 * 1024 * 1024;
      if (Number(request.headers.get("Content-Length")) > max)
        return json({ error: "Each image must be 5 MiB or smaller." }, 413);
      const reader = request.body?.getReader();
      if (!reader) return json({ error: "Choose an image." }, 400);
      const chunks: Uint8Array[] = [];
      let length = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > max) {
          await reader.cancel();
          return json({ error: "Each image must be 5 MiB or smaller." }, 413);
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return json(await images.upload(bytes, type), 201);
    } catch (error) {
      return json(
        {
          error:
            error instanceof ImageAttachmentError
              ? error.message
              : "Images are temporarily unavailable. Try again.",
        },
        error instanceof ImageAttachmentError ? 400 : 503,
      );
    }
  };
}
export const handleImageRequest = createImageRequestHandler({
  enabled: Boolean(feedbax.connected?.images),
  siteUrl: feedbax.product.siteUrl ?? "https://not-configured.invalid",
  signedIn: async (request) => Boolean(await requestParticipant(request)),
  getImages: async (request) =>
    configuredImages(
      createConfiguredFeedbackModule(),
      await requestParticipant(request),
    ),
  rateLimit: async (request) =>
    (
      await env.PORTAL_SUBMISSIONS_RATE_LIMITER.limit({
        key: `images:${request.headers.get("CF-Connecting-IP") ?? "unknown"}`,
      })
    ).success,
});
