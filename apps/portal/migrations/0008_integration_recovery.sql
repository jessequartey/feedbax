ALTER TABLE integration_receipts ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE integration_receipts ADD COLUMN next_attempt INTEGER NOT NULL DEFAULT 0;
ALTER TABLE integration_receipts ADD COLUMN lease_token TEXT;
ALTER TABLE integration_receipts ADD COLUMN lease_until INTEGER NOT NULL DEFAULT 0;
CREATE INDEX integration_receipts_due ON integration_receipts(installation_id,state,next_attempt,lease_until);
