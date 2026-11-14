-- A missing/trashed individual mirror is retained, never recreated. Exclude it from
-- the indexed outbox until an operator restores the row (observed by the poller).
ALTER TABLE posts ADD COLUMN notion_blocked INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
DROP INDEX posts_notion_pending;
--> statement-breakpoint
CREATE INDEX posts_notion_pending ON posts (updated_at, id) WHERE notion_blocked = 0 AND (notion_page_id IS NULL OR notion_revision < revision);
