-- One bounded row per voter; D1 batches atomically claim budget and mutate the vote.
CREATE TABLE vote_budget (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  burst_start INTEGER NOT NULL,
  burst_count INTEGER NOT NULL,
  hour_start INTEGER NOT NULL,
  hour_count INTEGER NOT NULL
);
--> statement-breakpoint
ALTER TABLE posts ADD COLUMN sync_queued_at INTEGER NOT NULL DEFAULT 0;
