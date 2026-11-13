ALTER TABLE subscription_checkout_sessions ADD COLUMN provider_order_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS checkout_provider_order_idx ON subscription_checkout_sessions(provider, provider_order_id);
