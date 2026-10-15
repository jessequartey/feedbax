CREATE TABLE IF NOT EXISTS participants (subject TEXT PRIMARY KEY NOT NULL, display_name TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS identity_nonces (nonce TEXT PRIMARY KEY NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS participant_sessions (token_hash TEXT PRIMARY KEY NOT NULL, subject TEXT NOT NULL REFERENCES participants(subject), expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS participant_votes (post_slug TEXT NOT NULL, subject TEXT NOT NULL REFERENCES participants(subject), PRIMARY KEY(post_slug, subject));
CREATE TABLE IF NOT EXISTS comment_attribution (comment_id TEXT PRIMARY KEY NOT NULL, subject TEXT NOT NULL REFERENCES participants(subject), display_name TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS participant_sessions_expiry ON participant_sessions(expires_at);
