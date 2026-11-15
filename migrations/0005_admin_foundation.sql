-- Feedbax 0.3.1 foundation: admin identity, moderation, runtime settings, changelog,
-- webhooks and email preferences. Additive only: new nullable/defaulted columns and new
-- tables. No existing column, index or row is dropped or rewritten. Timestamps are UTC ms.

-- Admin role and bans live on the Better Auth user row. Existing users become 'user'.
ALTER TABLE `user` ADD COLUMN `role` text DEFAULT 'user' NOT NULL CHECK (`role` IN ('user', 'admin'));
--> statement-breakpoint
ALTER TABLE `user` ADD COLUMN `banned_at` integer;
--> statement-breakpoint
-- Moderation actions. A hidden, spam or merged post stays in D1 (and in Notion) for audit.
ALTER TABLE `posts` ADD COLUMN `hidden_at` integer;
--> statement-breakpoint
ALTER TABLE `posts` ADD COLUMN `spam` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `posts` ADD COLUMN `merged_into` text REFERENCES `posts`(`id`);
--> statement-breakpoint
-- Runtime settings that override the safe feedbax.config.ts fields. `value` is JSON.
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `changelog_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` integer,
	`author_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "changelog_title_len" CHECK(length(title) BETWEEN 1 AND 200),
	CONSTRAINT "changelog_body_len" CHECK(length(body) <= 20000),
	CONSTRAINT "changelog_status" CHECK(status IN ('draft', 'published'))
);
--> statement-breakpoint
CREATE INDEX `changelog_status_published_idx` ON `changelog_entries` (`status`,`published_at`,`id`);
--> statement-breakpoint
CREATE TABLE `changelog_posts` (
	`entry_id` text NOT NULL,
	`post_id` text NOT NULL,
	PRIMARY KEY(`entry_id`, `post_id`),
	FOREIGN KEY (`entry_id`) REFERENCES `changelog_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- "Shipped in …" looks entries up by post.
CREATE INDEX `changelog_posts_post_idx` ON `changelog_posts` (`post_id`);
--> statement-breakpoint
CREATE TABLE `webhook_endpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`secret` text NOT NULL,
	`events` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT "webhook_endpoints_enabled" CHECK(enabled IN (0, 1))
);
--> statement-breakpoint
CREATE TABLE `webhook_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`endpoint_id` text NOT NULL,
	`event` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`response_status` integer,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`endpoint_id`) REFERENCES `webhook_endpoints`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "webhook_deliveries_status" CHECK(status IN ('pending', 'delivered', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `webhook_deliveries_endpoint_created_idx` ON `webhook_deliveries` (`endpoint_id`,`created_at`);
--> statement-breakpoint
-- One row per user, created lazily. Changelog email is opt-in; the others default on.
CREATE TABLE `email_prefs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`status_changes` integer DEFAULT 1 NOT NULL,
	`replies` integer DEFAULT 1 NOT NULL,
	`changelog` integer DEFAULT 0 NOT NULL,
	`unsubscribe_token` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `email_prefs_unsubscribe_token_unique` ON `email_prefs` (`unsubscribe_token`);
--> statement-breakpoint
-- Single-use markers for signed admin sign-in links (src/server/admin-link.ts).
-- A row exists only once a link was used; expired rows are pruned on the next use.
CREATE TABLE `admin_link_nonces` (
	`nonce` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer NOT NULL
);
