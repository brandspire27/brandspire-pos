ALTER TABLE plans ADD COLUMN half_yearly_price REAL CHECK (half_yearly_price IS NULL OR half_yearly_price > 0);
ALTER TABLE subscription_checkout_sessions ADD COLUMN term_months INTEGER CHECK (term_months IN (1,6,12));
ALTER TABLE subscriptions ADD COLUMN term_months INTEGER CHECK (term_months IN (1,6,12));
