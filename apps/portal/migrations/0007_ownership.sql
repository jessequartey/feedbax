CREATE TABLE IF NOT EXISTS post_ownership (post_id TEXT PRIMARY KEY, post_slug TEXT NOT NULL, subject TEXT NOT NULL, title TEXT NOT NULL, type TEXT NOT NULL, created_at INTEGER NOT NULL, withdrawn INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS owned_posts_subject ON post_ownership(subject,created_at,post_id);
