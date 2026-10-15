CREATE TABLE IF NOT EXISTS image_attachments (id TEXT PRIMARY KEY, subject TEXT NOT NULL REFERENCES participants(subject), object_key TEXT NOT NULL UNIQUE, content_type TEXT NOT NULL, bytes INTEGER NOT NULL, created_at INTEGER NOT NULL, post_slug TEXT, comment_id TEXT, deleting INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS image_attachments_post ON image_attachments(post_slug,comment_id);
CREATE INDEX IF NOT EXISTS image_attachments_cleanup ON image_attachments(created_at) WHERE post_slug IS NULL;
