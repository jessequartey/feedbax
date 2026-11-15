ALTER TABLE changelog_entries ADD COLUMN github_release_id integer;
--> statement-breakpoint
ALTER TABLE changelog_entries ADD COLUMN github_repo text;
--> statement-breakpoint
ALTER TABLE changelog_entries ADD COLUMN github_url text;
--> statement-breakpoint
ALTER TABLE changelog_entries ADD COLUMN github_notified_at integer;
--> statement-breakpoint
CREATE UNIQUE INDEX changelog_github_release_uq ON changelog_entries (github_repo, github_release_id);
