-- Feedbax 0.4.0 email notifications: a per-admin switch for the daily digest of new posts.
-- Additive only. Defaults on, like the other non-changelog email preferences.
ALTER TABLE `email_prefs` ADD COLUMN `digest` integer DEFAULT 1 NOT NULL CHECK (`digest` IN (0, 1));
