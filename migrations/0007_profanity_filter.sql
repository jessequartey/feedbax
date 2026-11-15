ALTER TABLE posts ADD COLUMN moderation_reason TEXT;
--> statement-breakpoint
ALTER TABLE comments ADD COLUMN hidden_at INTEGER;
--> statement-breakpoint
ALTER TABLE comments ADD COLUMN moderation_reason TEXT;
