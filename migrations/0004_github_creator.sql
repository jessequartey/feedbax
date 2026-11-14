-- Persist the immutable creator of a trusted issue response. Linked closes then
-- remain authenticated across portal URL and integration-token changes.
ALTER TABLE posts ADD COLUMN github_creator_id INTEGER;
