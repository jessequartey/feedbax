import type { D1Database } from "@cloudflare/workers-types";
import { and, count, eq, gt, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
  integer,
  primaryKey,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

export type ConnectedDatabase = D1Database;
export interface VerifiedParticipant {
  subject: string;
  displayName: string;
}
const participants = sqliteTable("participants", {
  subject: text("subject").primaryKey(),
  displayName: text("display_name").notNull(),
});
const nonces = sqliteTable("identity_nonces", {
  nonce: text("nonce").primaryKey(),
  expiresAt: integer("expires_at").notNull(),
});
const sessions = sqliteTable("participant_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  subject: text("subject")
    .notNull()
    .references(() => participants.subject),
  expiresAt: integer("expires_at").notNull(),
});
const votes = sqliteTable(
  "participant_votes",
  {
    postId: text("post_id").notNull(),
    subject: text("subject")
      .notNull()
      .references(() => participants.subject),
  },
  (t) => [primaryKey({ columns: [t.postId, t.subject] })],
);
const attribution = sqliteTable("comment_attribution", {
  commentId: text("comment_id").primaryKey(),
  subject: text("subject")
    .notNull()
    .references(() => participants.subject),
  displayName: text("display_name").notNull(),
});

export function createConnectedStore(binding: D1Database) {
  // Without read-replication sessions, D1 routes these queries to its primary.
  const db = drizzle(binding);
  return {
    async acceptIdentity(
      input: VerifiedParticipant & {
        nonce: string;
        challenge?: string;
        sessionHash: string;
        expiresAt: number;
      },
    ) {
      // A nonce collision rolls the entire D1 batch back, including session creation.
      await db.batch([
        db.insert(nonces).values([
          { nonce: `token:${input.nonce}`, expiresAt: input.expiresAt },
          ...(input.challenge
            ? [
                {
                  nonce: `browser:${input.challenge}`,
                  expiresAt: input.expiresAt,
                },
              ]
            : []),
        ]),
        db
          .insert(participants)
          .values({ subject: input.subject, displayName: input.displayName })
          .onConflictDoUpdate({
            target: participants.subject,
            set: { displayName: input.displayName },
          }),
        db.insert(sessions).values({
          tokenHash: input.sessionHash,
          subject: input.subject,
          expiresAt: input.expiresAt,
        }),
      ]);
    },
    async session(
      tokenHash: string,
      now = Date.now(),
    ): Promise<VerifiedParticipant | undefined> {
      return db
        .select({
          subject: participants.subject,
          displayName: participants.displayName,
        })
        .from(sessions)
        .innerJoin(participants, eq(participants.subject, sessions.subject))
        .where(
          and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)),
        )
        .get();
    },
    async logout(tokenHash: string) {
      await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
    },
    async setVote(postId: string, subject: string, voted: boolean) {
      if (voted)
        await db
          .insert(votes)
          .values({ postId, subject })
          .onConflictDoNothing();
      else
        await db
          .delete(votes)
          .where(and(eq(votes.postId, postId), eq(votes.subject, subject)));
    },
    async voteState(postId: string, subject?: string) {
      const [total, own] = await db.batch([
        db
          .select({ value: count() })
          .from(votes)
          .where(eq(votes.postId, postId)),
        db
          .select({ subject: votes.subject })
          .from(votes)
          .where(
            and(eq(votes.postId, postId), eq(votes.subject, subject ?? "")),
          )
          .limit(1),
      ]);
      return { voteCount: total[0]?.value ?? 0, voted: own.length > 0 };
    },
    async voteCounts(slugs: string[]) {
      const result = new Map<string, number>();
      for (let offset = 0; offset < slugs.length; offset += 80) {
        const rows = await db
          .select({ slug: votes.postId, total: count() })
          .from(votes)
          .where(inArray(votes.postId, slugs.slice(offset, offset + 80)))
          .groupBy(votes.postId);
        for (const row of rows) result.set(row.slug, row.total);
      }
      return result;
    },
    async commentSubject(commentId: string) {
      return (
        await db
          .select({ subject: attribution.subject })
          .from(attribution)
          .where(eq(attribution.commentId, commentId))
          .get()
      )?.subject;
    },
    async attributeComment(
      commentId: string,
      participant: VerifiedParticipant,
    ) {
      await db.insert(attribution).values({
        commentId,
        subject: participant.subject,
        displayName: participant.displayName,
      });
    },
    async commentAuthor(commentId: string) {
      const row = await db
        .select({ displayName: attribution.displayName })
        .from(attribution)
        .where(eq(attribution.commentId, commentId))
        .get();
      return row
        ? {
            kind: "participant" as const,
            displayName: row.displayName,
            verified: true as const,
          }
        : undefined;
    },
  };
}
export type ConnectedStore = ReturnType<typeof createConnectedStore>;
