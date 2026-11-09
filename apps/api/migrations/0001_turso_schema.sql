PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS user_profiles (
  firebase_uid TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT,
  disabled INTEGER NOT NULL DEFAULT 0 CHECK (disabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS owner_applications (
  id TEXT PRIMARY KEY NOT NULL,
  auth_user_id TEXT NOT NULL UNIQUE REFERENCES user_profiles(firebase_uid) ON DELETE CASCADE,
  email TEXT NOT NULL COLLATE NOCASE,
  owner_name TEXT NOT NULL,
  business_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  business_type TEXT,
  gstin TEXT,
  state TEXT,
  address TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en', 'hi', 'hinglish')),
  terms_version TEXT NOT NULL,
  terms_accepted_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  admin_note TEXT,
  reviewed_by TEXT REFERENCES user_profiles(firebase_uid) ON DELETE SET NULL,
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS owner_applications_status_created_idx ON owner_applications(status, created_at DESC);

CREATE TABLE IF NOT EXISTS platform_admins (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES user_profiles(firebase_uid) ON DELETE CASCADE,
  display_name TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'CLOSED')),
  owner_user_id TEXT NOT NULL REFERENCES user_profiles(firebase_uid),
  gstin TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  state TEXT,
  city TEXT,
  pincode TEXT,
  preferred_language TEXT NOT NULL DEFAULT 'en' CHECK (preferred_language IN ('en', 'hi', 'hinglish')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (id, owner_user_id)
);
CREATE INDEX IF NOT EXISTS organizations_status_created_idx ON organizations(status, created_at DESC);

CREATE TABLE IF NOT EXISTS organization_members (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user_profiles(firebase_uid) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'STAFF')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (organization_id, user_id),
  UNIQUE (organization_id, user_id, role)
);
CREATE INDEX IF NOT EXISTS organization_members_user_idx ON organization_members(user_id, active);
CREATE INDEX IF NOT EXISTS organization_members_org_role_idx ON organization_members(organization_id, role, active);

CREATE TABLE IF NOT EXISTS organization_settings (
  organization_id TEXT PRIMARY KEY NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_prefix TEXT NOT NULL DEFAULT 'BSP',
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  currency TEXT NOT NULL DEFAULT 'INR',
  negative_stock_enabled INTEGER NOT NULL DEFAULT 0 CHECK (negative_stock_enabled IN (0, 1)),
  default_print_format TEXT NOT NULL DEFAULT 'THERMAL_58MM' CHECK (default_print_format IN ('THERMAL_58MM', 'THERMAL_80MM', 'A4')),
  receipt_header TEXT,
  receipt_footer TEXT,
  invoice_footer TEXT,
  default_payment_method TEXT NOT NULL DEFAULT 'CASH' CHECK (default_payment_method IN ('CASH', 'UPI', 'CARD', 'CREDIT', 'OTHER')),
  allow_staff_discount INTEGER NOT NULL DEFAULT 0 CHECK (allow_staff_discount IN (0, 1)),
  staff_discount_limit REAL NOT NULL DEFAULT 0 CHECK (staff_discount_limit BETWEEN 0 AND 100),
  show_gstin_on_receipt INTEGER NOT NULL DEFAULT 1 CHECK (show_gstin_on_receipt IN (0, 1)),
  print_copies INTEGER NOT NULL DEFAULT 1 CHECK (print_copies BETWEEN 1 AND 5),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS staff_profiles (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES user_profiles(firebase_uid) ON DELETE CASCADE,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  phone TEXT,
  created_by TEXT REFERENCES user_profiles(firebase_uid) ON DELETE SET NULL,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS staff_profiles_org_created_idx ON staff_profiles(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS terms_acceptances (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES user_profiles(firebase_uid) ON DELETE CASCADE,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  application_id TEXT REFERENCES owner_applications(id) ON DELETE SET NULL,
  terms_version TEXT NOT NULL,
  accepted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  request_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY NOT NULL,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  monthly_price REAL CHECK (monthly_price IS NULL OR monthly_price >= 0),
  yearly_price REAL CHECK (yearly_price IS NULL OR yearly_price >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  minimum_months INTEGER NOT NULL DEFAULT 1 CHECK (minimum_months > 0),
  features TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(features)),
  provider_monthly_plan_id TEXT,
  provider_yearly_plan_id TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  plan_id TEXT REFERENCES plans(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (status IN ('PENDING_APPROVAL', 'TRIAL', 'ACTIVE', 'GRACE_PERIOD', 'EXPIRED', 'SUSPENDED', 'CANCELLED')),
  starts_at TEXT,
  ends_at TEXT,
  grace_ends_at TEXT,
  approved_by TEXT REFERENCES user_profiles(firebase_uid) ON DELETE SET NULL,
  approved_at TEXT,
  admin_message TEXT,
  provider TEXT,
  provider_subscription_id TEXT,
  provider_status TEXT,
  billing_cycle TEXT CHECK (billing_cycle IS NULL OR billing_cycle IN ('MONTHLY', 'YEARLY')),
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0 CHECK (cancel_at_period_end IN (0, 1)),
  last_payment_at TEXT,
  next_charge_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS subscriptions_org_status_idx ON subscriptions(organization_id, status);
CREATE INDEX IF NOT EXISTS subscriptions_ends_at_idx ON subscriptions(status, ends_at);
CREATE INDEX IF NOT EXISTS subscriptions_provider_idx ON subscriptions(provider, provider_subscription_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  actor_user_id TEXT REFERENCES user_profiles(firebase_uid) ON DELETE SET NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  request_id TEXT,
  summary TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(summary)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS audit_logs_org_created_idx ON audit_logs(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_actor_created_idx ON audit_logs(actor_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS printer_assets (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  asset_tag TEXT UNIQUE,
  serial_number TEXT,
  printer_type TEXT NOT NULL CHECK (printer_type IN ('THERMAL_58MM', 'THERMAL_80MM', 'A4')),
  ownership TEXT NOT NULL DEFAULT 'BRANDSPIRE' CHECK (ownership IN ('BRANDSPIRE', 'OWNER')),
  security_deposit REAL NOT NULL DEFAULT 0 CHECK (security_deposit >= 0),
  deposit_status TEXT NOT NULL DEFAULT 'NOT_REQUIRED' CHECK (deposit_status IN ('NOT_REQUIRED', 'PENDING', 'PAID', 'PARTIAL_REFUND', 'REFUNDED', 'FORFEITED')),
  issued_at TEXT,
  returned_at TEXT,
  return_condition TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  gstin TEXT,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (organization_id, id)
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  state TEXT,
  gstin TEXT,
  notes TEXT,
  outstanding_balance REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  deleted_at TEXT,
  created_by TEXT REFERENCES user_profiles(firebase_uid) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (organization_id, id)
);
CREATE INDEX IF NOT EXISTS customers_org_created_idx ON customers(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS customers_org_phone_idx ON customers(organization_id, phone);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category_id TEXT,
  supplier_id TEXT,
  name TEXT NOT NULL,
  sku TEXT,
  barcode TEXT,
  unit TEXT NOT NULL DEFAULT 'pcs',
  hsn_sac TEXT,
  purchase_price REAL NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
  selling_price REAL NOT NULL CHECK (selling_price >= 0),
  tax_rate REAL NOT NULL DEFAULT 0 CHECK (tax_rate BETWEEN 0 AND 100),
  tax_inclusive INTEGER NOT NULL DEFAULT 0 CHECK (tax_inclusive IN (0, 1)),
  stock REAL NOT NULL DEFAULT 0,
  low_stock_threshold REAL NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  image_key TEXT,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  deleted_at TEXT,
  created_by TEXT REFERENCES user_profiles(firebase_uid) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, category_id) REFERENCES categories(organization_id, id),
  FOREIGN KEY (organization_id, supplier_id) REFERENCES suppliers(organization_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS products_org_sku_unique ON products(organization_id, lower(sku)) WHERE sku IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS products_org_barcode_unique ON products(organization_id, barcode) WHERE barcode IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS products_org_created_idx ON products(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS products_org_name_idx ON products(organization_id, name);

CREATE TABLE IF NOT EXISTS invoice_counters (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invoice_year INTEGER NOT NULL,
  next_number INTEGER NOT NULL DEFAULT 1 CHECK (next_number > 0),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (organization_id, invoice_year)
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id TEXT,
  invoice_number TEXT NOT NULL,
  client_invoice_id TEXT,
  created_by TEXT NOT NULL REFERENCES user_profiles(firebase_uid),
  created_by_role TEXT NOT NULL CHECK (created_by_role IN ('OWNER', 'STAFF')),
  status TEXT NOT NULL CHECK (status IN ('DRAFT', 'PENDING', 'PAID', 'PARTIALLY_PAID', 'CANCELLED', 'REFUNDED')),
  payment_status TEXT NOT NULL CHECK (payment_status IN ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'REFUNDED')),
  payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('CASH', 'UPI', 'CARD', 'CREDIT', 'OTHER')),
  subtotal REAL NOT NULL DEFAULT 0,
  discount_type TEXT NOT NULL DEFAULT 'PERCENT' CHECK (discount_type IN ('PERCENT', 'FLAT')),
  discount_value REAL NOT NULL DEFAULT 0,
  discount_amount REAL NOT NULL DEFAULT 0,
  taxable_amount REAL NOT NULL DEFAULT 0,
  cgst REAL NOT NULL DEFAULT 0,
  sgst REAL NOT NULL DEFAULT 0,
  igst REAL NOT NULL DEFAULT 0,
  round_off REAL NOT NULL DEFAULT 0,
  grand_total REAL NOT NULL DEFAULT 0 CHECK (grand_total >= 0),
  amount_paid REAL NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  amount_due REAL NOT NULL DEFAULT 0 CHECK (amount_due >= 0),
  credited_amount REAL NOT NULL DEFAULT 0 CHECK (credited_amount >= 0),
  invoice_date TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  cancellation_reason TEXT,
  cancelled_by TEXT REFERENCES user_profiles(firebase_uid) ON DELETE SET NULL,
  cancelled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (organization_id, invoice_number),
  UNIQUE (organization_id, client_invoice_id),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, customer_id) REFERENCES customers(organization_id, id)
);
CREATE INDEX IF NOT EXISTS invoices_org_created_idx ON invoices(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS invoices_org_status_idx ON invoices(organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS invoices_org_customer_idx ON invoices(organization_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS invoices_org_due_idx ON invoices(organization_id, amount_due, created_at DESC) WHERE amount_due > 0 AND status NOT IN ('CANCELLED', 'REFUNDED');

CREATE TABLE IF NOT EXISTS invoice_items (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  invoice_id TEXT NOT NULL,
  product_id TEXT,
  product_name_snapshot TEXT NOT NULL,
  sku_snapshot TEXT,
  hsn_sac_snapshot TEXT,
  unit_snapshot TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit_price REAL NOT NULL CHECK (unit_price >= 0),
  tax_rate REAL NOT NULL CHECK (tax_rate BETWEEN 0 AND 100),
  tax_inclusive INTEGER NOT NULL CHECK (tax_inclusive IN (0, 1)),
  taxable_amount REAL NOT NULL,
  cgst REAL NOT NULL DEFAULT 0,
  sgst REAL NOT NULL DEFAULT 0,
  igst REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, invoice_id) REFERENCES invoices(organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, product_id) REFERENCES products(organization_id, id)
);
CREATE INDEX IF NOT EXISTS invoice_items_invoice_idx ON invoice_items(organization_id, invoice_id);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  invoice_id TEXT NOT NULL,
  amount REAL NOT NULL CHECK (amount > 0),
  method TEXT NOT NULL CHECK (method IN ('CASH', 'UPI', 'CARD', 'CREDIT', 'OTHER')),
  status TEXT NOT NULL DEFAULT 'CAPTURED' CHECK (status IN ('PENDING', 'CAPTURED', 'FAILED', 'REFUNDED')),
  payment_kind TEXT NOT NULL DEFAULT 'COLLECTION' CHECK (payment_kind IN ('COLLECTION', 'REFUND')),
  provider TEXT,
  provider_payment_id TEXT,
  note TEXT,
  created_by TEXT REFERENCES user_profiles(firebase_uid) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id, invoice_id) REFERENCES invoices(organization_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS payments_invoice_idx ON payments(organization_id, invoice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payments_org_created_idx ON payments(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  invoice_id TEXT,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('OPENING', 'STOCK_IN', 'STOCK_OUT', 'SALE', 'PURCHASE', 'ADJUSTMENT', 'RETURN')),
  quantity_change REAL NOT NULL,
  stock_after REAL NOT NULL,
  actor_user_id TEXT REFERENCES user_profiles(firebase_uid) ON DELETE SET NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id, product_id) REFERENCES products(organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, invoice_id) REFERENCES invoices(organization_id, id)
);
CREATE INDEX IF NOT EXISTS inventory_movements_product_idx ON inventory_movements(organization_id, product_id, created_at DESC);

CREATE TABLE IF NOT EXISTS credit_note_counters (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  note_year INTEGER NOT NULL,
  next_number INTEGER NOT NULL DEFAULT 1 CHECK (next_number > 0),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (organization_id, note_year)
);
CREATE TABLE IF NOT EXISTS credit_notes (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  invoice_id TEXT NOT NULL,
  customer_id TEXT,
  credit_note_number TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED', 'VOID')),
  refund_method TEXT NOT NULL CHECK (refund_method IN ('CASH', 'UPI', 'CARD', 'OTHER')),
  taxable_amount REAL NOT NULL DEFAULT 0,
  cgst REAL NOT NULL DEFAULT 0,
  sgst REAL NOT NULL DEFAULT 0,
  igst REAL NOT NULL DEFAULT 0,
  total_amount REAL NOT NULL CHECK (total_amount > 0),
  created_by TEXT NOT NULL REFERENCES user_profiles(firebase_uid),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (organization_id, credit_note_number),
  UNIQUE (organization_id, id),
  FOREIGN KEY (organization_id, invoice_id) REFERENCES invoices(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, customer_id) REFERENCES customers(organization_id, id)
);
CREATE TABLE IF NOT EXISTS credit_note_items (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  credit_note_id TEXT NOT NULL,
  invoice_item_id TEXT NOT NULL,
  product_id TEXT,
  product_name_snapshot TEXT NOT NULL,
  quantity REAL NOT NULL CHECK (quantity > 0),
  unit_credit REAL NOT NULL CHECK (unit_credit >= 0),
  taxable_amount REAL NOT NULL DEFAULT 0,
  cgst REAL NOT NULL DEFAULT 0,
  sgst REAL NOT NULL DEFAULT 0,
  igst REAL NOT NULL DEFAULT 0,
  line_total REAL NOT NULL CHECK (line_total > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (organization_id, credit_note_id) REFERENCES credit_notes(organization_id, id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id, invoice_item_id) REFERENCES invoice_items(organization_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id, product_id) REFERENCES products(organization_id, id)
);

CREATE TABLE IF NOT EXISTS subscription_checkout_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL,
  plan_id TEXT REFERENCES plans(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'CASHFREE',
  provider_session_id TEXT,
  provider_subscription_id TEXT,
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('MONTHLY', 'YEARLY')),
  status TEXT NOT NULL DEFAULT 'CREATED',
  amount REAL NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  metadata TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata)),
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (provider, provider_session_id)
);
CREATE TABLE IF NOT EXISTS payment_transactions (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL,
  checkout_session_id TEXT REFERENCES subscription_checkout_sessions(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'CASHFREE',
  provider_payment_id TEXT,
  amount REAL NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL,
  method TEXT,
  raw_reference TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  captured_at TEXT,
  UNIQUE (provider, provider_payment_id)
);
CREATE TABLE IF NOT EXISTS subscription_events (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  subscription_id TEXT REFERENCES subscriptions(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'CASHFREE',
  event_type TEXT NOT NULL,
  provider_event_id TEXT,
  details TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (provider, provider_event_id)
);
CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL DEFAULT 'CASHFREE',
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'RECEIVED' CHECK (processing_status IN ('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED')),
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  payload_hash TEXT NOT NULL,
  error_message TEXT,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  processed_at TEXT,
  UNIQUE (provider, provider_event_id)
);

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user_profiles(firebase_uid) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  input_chars INTEGER NOT NULL DEFAULT 0,
  success INTEGER NOT NULL DEFAULT 1 CHECK (success IN (0, 1)),
  error_code TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS ai_usage_org_created_idx ON ai_usage_events(organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS file_objects (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK (purpose IN ('INVOICE_PDF', 'PRODUCT_IMAGE', 'BUSINESS_LOGO', 'REPORT_EXPORT', 'DOCUMENT')),
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  uploaded_by TEXT REFERENCES user_profiles(firebase_uid) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (organization_id, id)
);
CREATE INDEX IF NOT EXISTS file_objects_org_purpose_idx ON file_objects(organization_id, purpose, created_at DESC);
