ALTER TABLE subscription_checkout_sessions ADD COLUMN created_by TEXT REFERENCES user_profiles(firebase_uid) ON DELETE SET NULL;
ALTER TABLE subscription_checkout_sessions ADD COLUMN payment_id TEXT;
ALTER TABLE subscription_checkout_sessions ADD COLUMN signature_verified_at TEXT;
CREATE INDEX IF NOT EXISTS checkout_sessions_created_by_idx ON subscription_checkout_sessions(created_by, created_at DESC);

ALTER TABLE payment_transactions ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata));
ALTER TABLE payment_webhook_events ADD COLUMN provider_subscription_id TEXT;
ALTER TABLE subscription_events ADD COLUMN provider_subscription_id TEXT;
CREATE INDEX IF NOT EXISTS payment_webhook_subscription_idx ON payment_webhook_events(provider, provider_subscription_id);
CREATE INDEX IF NOT EXISTS payment_transaction_org_created_idx ON payment_transactions(organization_id, created_at DESC);
