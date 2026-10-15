CREATE TABLE IF NOT EXISTS post_follows (post_slug TEXT NOT NULL, subject TEXT NOT NULL REFERENCES participants(subject), followed_at INTEGER NOT NULL, PRIMARY KEY(post_slug, subject));
CREATE INDEX IF NOT EXISTS post_follows_subject ON post_follows(subject);
CREATE TABLE IF NOT EXISTS participant_contacts (subject TEXT PRIMARY KEY REFERENCES participants(subject), email TEXT, email_enabled INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS post_observations (post_slug TEXT PRIMARY KEY, status TEXT NOT NULL, checked_at INTEGER NOT NULL, lease_until INTEGER NOT NULL DEFAULT 0, comment_cursor TEXT, lease_token TEXT);
CREATE TABLE IF NOT EXISTS post_events (id TEXT PRIMARY KEY, post_slug TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL, created_at INTEGER NOT NULL, actor_subject TEXT);
CREATE TABLE IF NOT EXISTS participant_notifications (id TEXT PRIMARY KEY, event_id TEXT NOT NULL REFERENCES post_events(id), subject TEXT NOT NULL REFERENCES participants(subject), created_at INTEGER NOT NULL, read_at INTEGER, email_state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0, lease_until INTEGER NOT NULL DEFAULT 0, lease_token TEXT, UNIQUE(event_id, subject));
CREATE INDEX IF NOT EXISTS notifications_subject ON participant_notifications(subject, created_at, id);
CREATE INDEX IF NOT EXISTS notifications_delivery ON participant_notifications(email_state, next_attempt_at);
