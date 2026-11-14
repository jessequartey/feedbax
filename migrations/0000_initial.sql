-- Feedbax 0.3.0 initial schema (D1 / SQLite).
-- Generated with drizzle-kit 0.31.11 from src/db/schema.ts (+ Better Auth tables from
-- src/db/auth-schema.ts), then hand-checked and reordered: auth tables first, boolean
-- defaults written as 0, and partial-index predicates unqualified. Timestamps are UTC ms.
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT 0 NOT NULL,
	`image` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`is_anonymous` integer DEFAULT 0,
	`host_subject` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_host_subject_unique` ON `user` (`host_subject`);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);
--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);
--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);
--> statement-breakpoint
CREATE TABLE `rate_limit` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`count` integer NOT NULL,
	`last_request` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rate_limit_key_unique` ON `rate_limit` (`key`);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`author_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`category` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`notion_page_id` text,
	`notion_revision` integer DEFAULT 0 NOT NULL,
	`github_requested` integer DEFAULT 0 NOT NULL,
	`github_number` integer,
	`github_url` text,
	`github_closed_at` integer,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "posts_title_len" CHECK(length(title) BETWEEN 1 AND 120),
	CONSTRAINT "posts_body_len" CHECK(length(body) BETWEEN 1 AND 5000),
	CONSTRAINT "posts_category" CHECK(category IN ('feature', 'bug', 'general')),
	CONSTRAINT "posts_status" CHECK(status IN ('open', 'planned', 'in_progress', 'done', 'closed')),
	CONSTRAINT "posts_github_requested" CHECK(github_requested IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `posts_notion_page_id_unique` ON `posts` (`notion_page_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `posts_github_number_unique` ON `posts` (`github_number`);
--> statement-breakpoint
CREATE INDEX `posts_created_idx` ON `posts` (`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX `posts_status_created_idx` ON `posts` (`status`,`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX `posts_category_created_idx` ON `posts` (`category`,`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX `posts_author_created_idx` ON `posts` (`author_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX `posts_notion_pending` ON `posts` (`id`) WHERE notion_page_id IS NULL OR notion_revision < revision;
--> statement-breakpoint
CREATE INDEX `posts_github_pending` ON `posts` (`id`) WHERE github_requested = 1 AND github_number IS NULL;
--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`author_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "comments_body_len" CHECK(length(body) BETWEEN 1 AND 2000)
);
--> statement-breakpoint
CREATE INDEX `comments_post_created_idx` ON `comments` (`post_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX `comments_author_created_idx` ON `comments` (`author_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `votes` (
	`post_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`post_id`, `user_id`),
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `votes_user_idx` ON `votes` (`user_id`);
--> statement-breakpoint
CREATE TABLE `images` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`position` integer NOT NULL,
	`object_key` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "images_position" CHECK(`position` BETWEEN 0 AND 2),
	CONSTRAINT "images_mime" CHECK(mime IN ('image/png', 'image/jpeg', 'image/webp'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `images_object_key_unique` ON `images` (`object_key`);
--> statement-breakpoint
CREATE UNIQUE INDEX `images_post_position_uq` ON `images` (`post_id`,`position`);
--> statement-breakpoint
CREATE TABLE `used_tokens` (
	`jti` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
