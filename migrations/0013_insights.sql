-- Admin insights. Additive only: two nullable stamps and two window indexes.
-- Time-window reads (votes and comments in the last N days) use the new indexes.
CREATE INDEX votes_created_post_idx ON votes (created_at, post_id);
--> statement-breakpoint
CREATE INDEX comments_created_post_idx ON comments (created_at, post_id);
--> statement-breakpoint
-- updated_at changes on every vote, comment, edit and moderation, so it is not a status-change
-- time. These two stamps are set by the triggers below, which cover every write path (admin UI,
-- Notion sync, GitHub close, merge). Existing rows keep NULL: history is never guessed.
ALTER TABLE posts ADD COLUMN status_changed_at INTEGER;
--> statement-breakpoint
ALTER TABLE posts ADD COLUMN done_at INTEGER;
--> statement-breakpoint
-- First move off 'open'. Later moves, and reopening, leave it alone.
CREATE TRIGGER posts_status_changed_at AFTER UPDATE OF status ON posts
WHEN OLD.status = 'open' AND NEW.status != 'open' AND NEW.status_changed_at IS NULL
BEGIN
  UPDATE posts SET status_changed_at = CAST(unixepoch('subsec') * 1000 AS INTEGER) WHERE id = NEW.id;
END;
--> statement-breakpoint
-- Every move to 'done'. A post reopened and finished again gets the newer time.
CREATE TRIGGER posts_done_at AFTER UPDATE OF status ON posts
WHEN NEW.status = 'done' AND OLD.status != 'done'
BEGIN
  UPDATE posts SET done_at = CAST(unixepoch('subsec') * 1000 AS INTEGER) WHERE id = NEW.id;
END;
