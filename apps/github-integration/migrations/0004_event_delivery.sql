ALTER TABLE portal_work ADD COLUMN dispatch_after INTEGER NOT NULL DEFAULT 0;
ALTER TABLE portal_bindings ADD COLUMN next_recovery_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE portal_bindings ADD COLUMN cooldown_until INTEGER NOT NULL DEFAULT 0;

DROP INDEX due_portal_work;
CREATE INDEX due_portal_work ON portal_work(state,priority DESC,next_attempt,id,lease_until);
CREATE INDEX dispatch_portal_work ON portal_work(state,dispatch_after,id);
CREATE INDEX due_portal_revocations ON portal_work(next_attempt,id,lease_until) WHERE state='pending' AND priority=3;
CREATE INDEX binding_portal_work ON portal_work(installation_id,binding_version,state,kind);
CREATE INDEX expired_work_diagnostics ON portal_work(created_at,id) WHERE failure_code IS NOT NULL;
CREATE INDEX receipt_portal_work ON portal_work(app_id,delivery_id,state);
CREATE INDEX retained_webhook_payloads ON webhook_receipts(received_at) WHERE payload IS NOT NULL;
CREATE INDEX expired_integration_nonces ON integration_nonces(expires_at);
CREATE INDEX expired_pairing_attempts ON pairing_attempts(expires_at);
CREATE INDEX installation_portal_bindings ON portal_bindings(github_installation_id);
CREATE INDEX recovery_portal_bindings ON portal_bindings(active,next_recovery_at,installation_id);
