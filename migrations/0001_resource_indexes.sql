-- Feedbax 0.3.0 resource pass. Indexes only; no data changes.
-- Trending sort and vote counts: count a post's recent votes from the index alone.
CREATE INDEX `votes_post_created_idx` ON `votes` (`post_id`,`created_at`);
--> statement-breakpoint
-- Cron: decide in one index read whether any linked GitHub issue is still open.
CREATE INDEX `posts_github_open` ON `posts` (`id`) WHERE github_number IS NOT NULL AND github_closed_at IS NULL;
