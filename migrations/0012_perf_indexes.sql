-- Covering and partial indexes for admin moderation, user management and changelog reads.
CREATE INDEX changelog_updated_idx ON changelog_entries (updated_at, id);
--> statement-breakpoint
CREATE INDEX posts_hidden_created_idx ON posts (created_at, id) WHERE hidden_at IS NOT NULL AND spam = 0;
--> statement-breakpoint
CREATE INDEX posts_spam_created_idx ON posts (created_at, id) WHERE spam = 1;
--> statement-breakpoint
CREATE INDEX user_role_created_idx ON user (role, created_at, id);
--> statement-breakpoint
CREATE INDEX user_banned_created_idx ON user (created_at, id) WHERE banned_at IS NOT NULL;
