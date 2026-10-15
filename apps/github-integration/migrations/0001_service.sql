CREATE TABLE portal_bindings (
  installation_id TEXT PRIMARY KEY,
  origin TEXT NOT NULL,
  github_installation_id INTEGER NOT NULL,
  repository_id INTEGER NOT NULL,
  repository_owner TEXT NOT NULL,
  repository_name TEXT NOT NULL,
  bot_user_id INTEGER NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  UNIQUE(repository_id)
);
CREATE TABLE integration_nonces (installation_id TEXT NOT NULL, nonce TEXT NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY(installation_id,nonce));
CREATE TABLE pairing_attempts (
  state TEXT PRIMARY KEY,
  installation_id TEXT NOT NULL,
  origin TEXT NOT NULL,
  github_installation_id INTEGER NOT NULL,
  repository_id INTEGER NOT NULL,
  sealed_secret TEXT,
  expires_at INTEGER NOT NULL,
  consumed INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE portal_bindings ADD COLUMN last_delivery_at INTEGER NOT NULL DEFAULT 0;
CREATE TABLE webhook_receipts (
  app_id TEXT NOT NULL,
  delivery_id TEXT NOT NULL,
  ingress_token TEXT NOT NULL,
  event TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  payload TEXT,
  PRIMARY KEY(app_id,delivery_id)
);
CREATE TABLE portal_work (
  id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  delivery_id TEXT,
  installation_id TEXT NOT NULL REFERENCES portal_bindings(installation_id),
  kind TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  lease_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  failure_code TEXT,
  completed_at INTEGER
);
CREATE INDEX due_portal_work ON portal_work(state,next_attempt,priority);
