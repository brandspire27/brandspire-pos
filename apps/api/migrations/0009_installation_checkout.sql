ALTER TABLE owner_applications ADD COLUMN installation_package_code TEXT
  CHECK (installation_package_code IS NULL OR installation_package_code IN ('SCH_58MM', 'STANDARD_58MM', 'STANDARD_80MM', 'AUTO_CUTTER_80MM'));
ALTER TABLE owner_applications ADD COLUMN installation_amount INTEGER
  CHECK (installation_amount IS NULL OR installation_amount > 0);
ALTER TABLE owner_applications ADD COLUMN installation_payment_method TEXT
  CHECK (installation_payment_method IS NULL OR installation_payment_method IN ('CASHFREE', 'CASH_ON_INSTALLATION'));

CREATE TABLE installation_checkout_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  application_id TEXT NOT NULL REFERENCES owner_applications(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('CASHFREE_PG', 'CASH_ON_INSTALLATION')),
  provider_order_id TEXT UNIQUE,
  provider_session_id TEXT,
  provider_payment_id TEXT,
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
  status TEXT NOT NULL CHECK (status IN ('CREATED', 'DUE', 'PAID', 'COLLECTED', 'CLOSED')),
  request_payload TEXT,
  metadata TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata)),
  paid_at TEXT,
  collected_at TEXT,
  collected_by TEXT REFERENCES user_profiles(firebase_uid) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX installation_checkout_application_idx
  ON installation_checkout_sessions(application_id, created_at DESC);
CREATE INDEX installation_checkout_status_idx
  ON installation_checkout_sessions(provider, status, created_at DESC);
