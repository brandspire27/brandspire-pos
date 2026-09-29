# Brandspire POS - production backup & recovery runbook

## Before launch
- Confirm the Supabase project has the backup/restore capability appropriate to the selected plan.
- Record who is authorized to restore production data.
- Never keep database passwords or service-role keys inside this repository.
- Complete at least one restore drill on a non-production project before calling backups verified.

## Before a destructive migration
1. Use a maintenance window if billing can be affected.
2. Take a database backup/export using supported Supabase tooling.
3. Save the exact migration SQL and release SHA.
4. Run the migration on staging first.
5. Verify login, workspace bootstrap, test invoice, stock mutation, payment collection and reports.
6. Only then apply to production.

## Recovery priorities
1. Preserve invoice/payment records and audit history.
2. Restore tenant isolation/RLS before normal access.
3. Restore organization, owner/staff and subscription state.
4. Restore catalog/customer data.
5. Reconcile Android offline invoices using client_invoice_id; never create replacements blindly.

## Restore drill checklist
- Restore into a separate project/database, not over production.
- Run Phase 15 security tests against the restored environment.
- Compare invoice counts, payment totals, product stock and organization counts.
- Test one Owner and one Staff tenant.
- Record recovery time and every manual step.
