ALTER TABLE portal_work ADD COLUMN binding_version INTEGER NOT NULL DEFAULT 0;
-- Legacy active-binding work has no provable generation; fresh polling replaces it.
-- Revoked bindings may still deliver their current revocation safely.
UPDATE portal_work SET binding_version=(SELECT key_version FROM portal_bindings WHERE portal_bindings.installation_id=portal_work.installation_id) WHERE EXISTS(SELECT 1 FROM portal_bindings WHERE portal_bindings.installation_id=portal_work.installation_id AND active=0);
