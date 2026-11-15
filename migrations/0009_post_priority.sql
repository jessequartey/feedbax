-- Optional, admin-only triage score. Existing posts remain unscored.
ALTER TABLE posts ADD COLUMN priority INTEGER
  CHECK (priority IS NULL OR (typeof(priority) = 'integer' AND priority BETWEEN 0 AND 100));
--> statement-breakpoint
ALTER TABLE posts ADD COLUMN priority_updated_at INTEGER;
--> statement-breakpoint
-- Last mirrored/imported value distinguishes Notion edits from our own page updates.
ALTER TABLE posts ADD COLUMN notion_priority INTEGER;
--> statement-breakpoint
CREATE INDEX posts_priority_created_idx ON posts(priority, created_at, id);
