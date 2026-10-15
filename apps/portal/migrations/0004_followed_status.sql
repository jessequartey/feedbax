ALTER TABLE post_follows ADD COLUMN observed_status TEXT;
ALTER TABLE post_follows ADD COLUMN baseline_token TEXT;
ALTER TABLE post_follows ADD COLUMN ready INTEGER NOT NULL DEFAULT 0;
ALTER TABLE post_follows ADD COLUMN baseline_cursor TEXT;
ALTER TABLE post_follows ADD COLUMN baseline_lease_until INTEGER NOT NULL DEFAULT 0;
ALTER TABLE post_follows ADD COLUMN baseline_checked_at INTEGER NOT NULL DEFAULT 0;
UPDATE post_follows SET observed_status=(SELECT status FROM post_observations WHERE post_observations.post_slug=post_follows.post_slug);
ALTER TABLE post_events ADD COLUMN status TEXT;
CREATE TABLE follow_comment_baselines (post_slug TEXT NOT NULL, subject TEXT NOT NULL, event_id TEXT NOT NULL, PRIMARY KEY(post_slug,subject,event_id), FOREIGN KEY(post_slug,subject) REFERENCES post_follows(post_slug,subject) ON DELETE CASCADE);
