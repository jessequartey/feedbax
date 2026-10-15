import { createHash } from "node:crypto";
import { BrowserCapabilityAuthorizationError } from "./index";
import type { D1Database } from "@cloudflare/workers-types";
import type {
  FeedbackModule,
  ParticipantPost,
  Post,
  PostType,
  PublicPost,
} from "./index";
import type { VerifiedParticipant } from "./connected";

export interface PostOwnership {
  owns(id: string): Promise<boolean>;
  register(post: Post): Promise<void>;
  withdrawn(id: string): Promise<void>;
}
export function createPostOwnership(
  database: D1Database,
  participant: VerifiedParticipant,
): PostOwnership {
  return {
    async owns(id) {
      return Boolean(
        await database
          .prepare("SELECT 1 FROM post_ownership WHERE post_id=? AND subject=?")
          .bind(id, participant.subject)
          .first(),
      );
    },
    async register(post) {
      await database
        .prepare(
          "INSERT OR IGNORE INTO post_ownership(post_id,post_slug,subject,title,type,created_at) VALUES(?,?,?,?,?,?)",
        )
        .bind(
          post.id,
          post.slug,
          participant.subject,
          post.title,
          post.type,
          post.createdAt.getTime(),
        )
        .run();
      if (!(await this.owns(post.id)))
        throw new BrowserCapabilityAuthorizationError();
    },
    async withdrawn(id) {
      await database
        .prepare(
          "UPDATE post_ownership SET withdrawn=1 WHERE post_id=? AND subject=?",
        )
        .bind(id, participant.subject)
        .run();
    },
  };
}
export type MyFeedbackFilter = "submitted" | "supported" | "following";
export type MyFeedbackItem = Partial<ParticipantPost> &
  Pick<PublicPost, "slug" | "title"> & {
    unavailable?: boolean;
    withdrawn?: boolean;
  };
export interface MyFeedbackPage {
  items: MyFeedbackItem[];
  nextCursor?: string;
}
export function createMyFeedbackModule(options: {
  database: D1Database;
  feedback: FeedbackModule;
  participant: VerifiedParticipant;
}) {
  const { database, feedback, participant } = options;
  return {
    async list(input: {
      filter: MyFeedbackFilter;
      cursor?: string;
    }): Promise<MyFeedbackPage> {
      if (!["submitted", "supported", "following"].includes(input.filter))
        throw new Error("Invalid My feedback filter.");
      const fingerprint = createHash("sha256")
        .update(JSON.stringify([participant.subject, input.filter]))
        .digest("hex");
      let cursor = { at: Number.MAX_SAFE_INTEGER, key: "" };
      if (input.cursor) {
        try {
          if (input.cursor.length > 2048) throw new Error();
          const value = JSON.parse(
            Buffer.from(input.cursor, "base64url").toString(),
          );
          if (
            value.view !== fingerprint ||
            !Number.isSafeInteger(value.at) ||
            value.at < 0 ||
            typeof value.key !== "string" ||
            value.key.length > 512
          )
            throw new Error();
          cursor = value;
        } catch {
          throw new Error("Invalid My feedback cursor.");
        }
      }
      const selection =
        input.filter === "submitted"
          ? "SELECT post_id AS key,post_slug AS slug,created_at AS at,title,type,withdrawn FROM post_ownership WHERE subject=?"
          : input.filter === "supported"
            ? "SELECT post_slug AS key,post_slug AS slug,0 AS at FROM participant_votes WHERE subject=?"
            : "SELECT post_slug AS key,post_slug AS slug,followed_at AS at FROM post_follows WHERE subject=?";
      const rows = (
        await database
          .prepare(
            `SELECT * FROM (${selection}) WHERE at<? OR (at=? AND key>?) ORDER BY at DESC,key LIMIT 11`,
          )
          .bind(participant.subject, cursor.at, cursor.at, cursor.key)
          .all<{
            key: string;
            slug: string;
            at: number;
            title?: string;
            type?: PostType;
            withdrawn?: number;
          }>()
      ).results;
      const items = await Promise.all(
        rows.slice(0, 10).map(async (row): Promise<MyFeedbackItem> => {
          if (input.filter === "submitted") {
            if (!row.withdrawn) {
              const post = await feedback.getParticipantPost(row.key);
              if (post) return post;
            }
            return {
              id: row.key,
              slug: row.slug,
              title: row.title ?? "Submission unavailable",
              type: row.type,
              editable: false,
              unavailable: true,
              ...(row.withdrawn ? { withdrawn: true } : {}),
            };
          }
          const post = await feedback.getPublicPost(row.slug);
          return post
            ? { ...post, published: true, editable: false }
            : {
                slug: row.slug,
                title: "Post unavailable",
                unavailable: true,
                editable: false,
              };
        }),
      );
      const last = rows[9];
      return {
        items,
        ...(rows.length > 10 && last
          ? {
              nextCursor: Buffer.from(
                JSON.stringify({
                  at: last.at,
                  key: last.key,
                  view: fingerprint,
                }),
              ).toString("base64url"),
            }
          : {}),
      };
    },
  };
}
