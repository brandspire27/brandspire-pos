# BrandSpire production backup and recovery

Updated 14 November 2026. Current runtime is Firebase Authentication, Turso/libSQL data, and optional R2 file storage. Supabase-era recovery instructions are obsolete for the current API.

## Verified scope
The local closed-database backup/restore drill passed using scripts/backup-restore-smoke.mjs: integrity and foreign keys, exact invoice/item/payment/stock records, and retry after restoration. This is NOT proof that live Turso backups or R2 recovery are configured.

## Before accepting real shop data
- Verify provider backup availability, retention and restore procedure for the actual Turso account/plan.
- Record an authorized restore operator, secure backup destination, encryption and retention policy.
- Restore a production-shaped snapshot into a separate staging database; never overwrite production for a drill.
- Verify Firebase identity-to-membership mapping, tenant isolation, migration versions and R2 file references after restore.
- Compare invoice counts and totals, payments, dues, stock movements, subscriptions and audit records.
- Replay a known client invoice ID and Cashfree order: neither may duplicate a bill/payment or extend access twice.
- Reconcile successful provider payments newer than the restored snapshot before opening writes.
- Record measured recovery time and data-loss window; agree acceptable targets before launch.

## Device data
Unsynced browser IndexedDB or Android Room data is not included in a cloud database backup. Do not uninstall/reset the device or clear browser storage while bills are pending. Export/recovery for device loss needs its own verified process.

## Incident sequence
Restrict writes when necessary, preserve logs/queues, restore to staging, verify counts and permissions, reconcile external payments, then switch the service after review. Keep the previous database read-only until reconciliation is complete. Do not recreate invoices blindly.
