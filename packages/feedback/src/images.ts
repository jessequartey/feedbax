import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { D1Database } from "@cloudflare/workers-types";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { BrowserCapability, FeedbackModule } from "./index";
import type { VerifiedParticipant } from "./connected";

export interface ImageAttachment {
  id: string;
  src: string;
  contentType: string;
  bytes: number;
}
type ImageRow = {
  id: string;
  subject: string;
  object_key: string;
  content_type: string;
  bytes: number;
  created_at: number;
  deleting: number;
  post_slug: string | null;
  comment_id: string | null;
};
const limit = 5 * 1024 * 1024;
export class ImageAttachmentError extends Error {}
export function createImageModule(options: {
  database: D1Database;
  bucket: {
    put(
      key: string,
      value: ArrayBuffer,
      options: { httpMetadata: { contentType: string } },
    ): Promise<unknown>;
    get(key: string): Promise<{ body: unknown } | null>;
    delete(key: string): Promise<void>;
  };
  feedback: FeedbackModule;
  participant?: VerifiedParticipant;
  processing?: "small" | "standard";
  reviewSecret: string;
  now?: () => number;
}) {
  const db = drizzle(options.database);
  const now = () => options.now?.() ?? Date.now();
  const identity = () => {
    if (!options.participant)
      throw new ImageAttachmentError("Sign in to add images.");
    return options.participant;
  };
  const row = (id: string) =>
    db.get<ImageRow>(sql`SELECT * FROM image_attachments WHERE id=${id}`);
  const projection = (image: ImageRow): ImageAttachment => ({
    id: image.id,
    src: `/internal/images/${image.id}`,
    contentType: image.content_type,
    bytes: image.bytes,
  });
  const publicComment = async (slug: string, commentId: string) => {
    let cursor: string | undefined;
    do {
      const page = await options.feedback.listCommentThreads({ slug, cursor });
      if (
        page.items.some((thread) =>
          thread.comments.some((comment) => comment.id === commentId),
        )
      )
        return true;
      cursor = page.nextCursor;
    } while (cursor);
    return false;
  };
  const claim = async (ids: string[], slug: string, commentId?: string) => {
    const person = identity();
    if (!ids.length) return;
    if (
      ids.length > 4 ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !/^[-a-f0-9]{36}$/.test(id))
    )
      throw new ImageAttachmentError("Choose up to four images.");
    const list = sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `,
    );
    const eligible = sql`subject=${person.subject} AND id IN (${list}) AND (post_slug IS NULL OR (post_slug=${slug} AND comment_id IS ${commentId ?? null})) AND deleting=0 AND (post_slug IS NOT NULL OR created_at > ${now() - 86400000})`;
    const claimed = await db.all<{ id: string }>(
      sql`UPDATE image_attachments SET post_slug=${slug},comment_id=${commentId ?? null} WHERE ${eligible} AND (SELECT COUNT(*) FROM image_attachments WHERE ${eligible})=${ids.length} AND (SELECT COUNT(*) FROM image_attachments WHERE post_slug=${slug} AND comment_id IS ${commentId ?? null} AND id NOT IN (${list}))+${ids.length} <= 4 RETURNING id`,
    );
    if (claimed.length !== ids.length)
      throw new ImageAttachmentError(
        "One or more images are unavailable. Upload them again.",
      );
  };
  return {
    async validateCommentImages(ids: string[], slug: string) {
      if (!ids.length) return;
      const person = identity();
      if (ids.length > 4 || new Set(ids).size !== ids.length)
        throw new ImageAttachmentError("Choose up to four images.");
      let attachedComment: string | undefined;
      for (const id of ids) {
        const image = await row(id);
        if (
          !image ||
          image.subject !== person.subject ||
          image.deleting ||
          (image.post_slug === null
            ? image.created_at <= now() - 86400000
            : image.post_slug !== slug ||
              !image.comment_id ||
              (attachedComment !== undefined &&
                attachedComment !== image.comment_id))
        )
          throw new ImageAttachmentError(
            "One or more images are unavailable. Upload them again.",
          );
        if (image.comment_id) attachedComment = image.comment_id;
      }
      return attachedComment;
    },
    async validatePending(ids: string[]) {
      if (!ids.length) return;
      const person = identity();
      if (ids.length > 4 || new Set(ids).size !== ids.length)
        throw new ImageAttachmentError("Choose up to four images.");
      for (const id of ids) {
        const image = await row(id);
        if (
          !image ||
          image.subject !== person.subject ||
          image.post_slug ||
          image.deleting ||
          image.created_at <= now() - 86400000
        )
          throw new ImageAttachmentError(
            "One or more images are unavailable. Upload them again.",
          );
      }
    },
    async upload(
      bytes: Uint8Array,
      contentType: string,
    ): Promise<ImageAttachment> {
      const person = identity();
      if (bytes.byteLength > limit)
        throw new ImageAttachmentError("Each image must be 5 MiB or smaller.");
      if (!validImage(bytes, contentType))
        throw new ImageAttachmentError(
          "Choose a valid JPEG, PNG, or WebP image.",
        );
      const id = randomUUID(),
        objectKey = `participant-images/${id}`;
      const reserved = await db.get(
        sql`INSERT INTO image_attachments(id,subject,object_key,content_type,bytes,created_at) SELECT ${id},${person.subject},${objectKey},${contentType},${bytes.byteLength},${now()} WHERE (SELECT COUNT(*) FROM image_attachments WHERE subject=${person.subject} AND post_slug IS NULL AND deleting=0 AND created_at > ${now() - 86400000}) < 20 RETURNING id`,
      );
      if (!reserved)
        throw new ImageAttachmentError(
          "Too many unused images. Remove one or try again later.",
        );
      try {
        await options.bucket.put(objectKey, bytes.slice().buffer, {
          httpMetadata: { contentType },
        });
      } catch (error) {
        await db.run(
          sql`UPDATE image_attachments SET deleting=1 WHERE id=${id}`,
        );
        throw error;
      }
      return {
        id,
        src: `/internal/images/${id}`,
        contentType,
        bytes: bytes.byteLength,
      };
    },
    async attachPost(input: {
      ids: string[];
      id: string;
      browserCapability: BrowserCapability;
    }) {
      identity();
      const post = await options.feedback.getDraftPost({
        id: input.id,
        browserCapability: input.browserCapability,
      });
      await claim(input.ids, post.slug);
      return this.forPost(post.slug);
    },
    async attachComment(input: {
      ids: string[];
      slug: string;
      commentId: string;
    }) {
      const person = identity();
      if (
        !(await options.feedback.getPublicPost(input.slug)) ||
        !(await publicComment(input.slug, input.commentId))
      )
        throw new ImageAttachmentError("Comment is unavailable.");
      const author = await db.get<{ subject: string }>(
        sql`SELECT subject FROM comment_attribution WHERE comment_id=${input.commentId}`,
      );
      if (author?.subject !== person.subject)
        throw new ImageAttachmentError("Comment is unavailable.");
      await claim(input.ids, input.slug, input.commentId);
      return this.forComment(input.slug, input.commentId);
    },
    async forPost(slug: string): Promise<ImageAttachment[]> {
      return (
        await db.all<ImageRow>(
          sql`SELECT * FROM image_attachments WHERE post_slug=${slug} AND comment_id IS NULL AND deleting=0 ORDER BY created_at,id`,
        )
      ).map(projection);
    },
    async forComment(
      slug: string,
      commentId: string,
    ): Promise<ImageAttachment[]> {
      return (
        await db.all<ImageRow>(
          sql`SELECT * FROM image_attachments WHERE post_slug=${slug} AND comment_id=${commentId} AND deleting=0 ORDER BY created_at,id`,
        )
      ).map(projection);
    },
    async forComments(slug: string, ids: string[]) {
      const result = new Map<string, ImageAttachment[]>();
      if (!ids.length) return result;
      const list = sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      );
      const rows = await db.all<ImageRow>(
        sql`SELECT * FROM image_attachments WHERE post_slug=${slug} AND comment_id IN (${list}) AND deleting=0 ORDER BY created_at,id`,
      );
      for (const image of rows) {
        const key = image.comment_id!;
        result.set(key, [...(result.get(key) ?? []), projection(image)]);
      }
      return result;
    },
    async reviewUrl(id: string, siteUrl: string) {
      if (options.reviewSecret.length < 32)
        throw new Error("Image review secret is missing.");
      if (!(await row(id)))
        throw new ImageAttachmentError("Image is unavailable.");
      const target = new URL(`/internal/images/${id}`, siteUrl);
      target.searchParams.set("review", reviewMac(id, options.reviewSecret));
      return target.toString();
    },
    async read(id: string, review?: string) {
      const image = await row(id);
      if (!image || image.deleting) return;
      const owner = options.participant?.subject === image.subject;
      let reviewer = false;
      if (review && options.reviewSecret.length >= 32) {
        const wanted = Buffer.from(reviewMac(id, options.reviewSecret)),
          got = Buffer.from(review);
        reviewer = wanted.length === got.length && timingSafeEqual(wanted, got);
      }
      let allowed: boolean;
      if (!image.post_slug)
        allowed = owner && image.created_at > now() - 86400000;
      else {
        const state = await options.feedback.getAttachmentPostState(
          image.post_slug,
        );
        if (image.comment_id)
          allowed =
            state === "published" &&
            (await publicComment(image.post_slug, image.comment_id));
        else
          allowed =
            state === "published" ||
            Boolean(state && reviewer) ||
            (state === "draft" && owner);
      }
      if (!allowed) return;
      const object = await options.bucket.get(image.object_key);
      return object
        ? {
            body: object.body,
            contentType: image.content_type,
            bytes: image.bytes,
          }
        : undefined;
    },
    async discardAttached(slug: string, commentId?: string) {
      const person = identity();
      await db.run(
        sql`UPDATE image_attachments SET deleting=1 WHERE post_slug=${slug} AND comment_id IS ${commentId ?? null} AND subject=${person.subject}`,
      );
    },
    async removePending(id: string) {
      const person = identity();
      const image = await db.get<ImageRow>(
        sql`UPDATE image_attachments SET deleting=1 WHERE id=${id} AND subject=${person.subject} AND post_slug IS NULL RETURNING *`,
      );
      if (!image) throw new ImageAttachmentError("Image is unavailable.");
      await options.bucket.delete(image.object_key);
      await db.run(
        sql`DELETE FROM image_attachments WHERE id=${id} AND deleting=1`,
      );
    },
    async cleanup() {
      const rows = await db.all<ImageRow>(
        sql`UPDATE image_attachments SET deleting=1 WHERE id IN(SELECT id FROM image_attachments WHERE deleting=1 OR (post_slug IS NULL AND created_at <= ${now() - 86400000}) LIMIT ${options.processing === "small" ? 5 : 50}) RETURNING *`,
      );
      for (const image of rows) {
        await options.bucket.delete(image.object_key);
        await db.run(
          sql`DELETE FROM image_attachments WHERE id=${image.id} AND deleting=1`,
        );
      }
      return rows.length;
    },
  };
}
const reviewMac = (id: string, secret: string) =>
  createHmac("sha256", secret)
    .update(`feedbax-image-review-v1:${id}`)
    .digest("base64url");
function validImage(b: Uint8Array, type: string) {
  if (type === "image/png")
    return (
      b.length >= 33 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v) &&
      String.fromCharCode(...b.slice(12, 16)) === "IHDR"
    );
  if (type === "image/jpeg")
    return (
      b.length >= 4 &&
      b[0] === 255 &&
      b[1] === 216 &&
      b[2] === 255 &&
      b[b.length - 2] === 255 &&
      b[b.length - 1] === 217
    );
  if (type === "image/webp")
    return (
      b.length >= 20 &&
      String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...b.slice(8, 12)) === "WEBP" &&
      new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(4, true) +
        8 ===
        b.length
    );
  return false;
}
