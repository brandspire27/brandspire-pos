# Brandspire POS — Phase 20: Admin Monitoring, Audit & SaaS Control

Phase 20 upgrades the Brandspire Admin portal into a real platform control center. It does not change Owner/Staff business permissions and does not expose service-role credentials to the browser.

## What is included

- Platform dashboard metrics: businesses, attention queue, pending applications, Cashfree revenue, webhook failures.
- Tenant directory with search, platform-status filter and "needs attention" filter.
- Tenant detail page with subscription, staff, printer assets, recent invoices and audit history.
- Admin support actions: suspend access, restore access, extend by days, update Owner-facing admin message.
- Every destructive/support action is audit logged.
- Restore is blocked when access is already expired; Admin must extend first.
- Full Admin audit-trail page with tenant filter.
- Admin Billing page corrected from Razorpay wording to Cashfree wording.
- No ordinary Admin client receives Supabase service-role access; all controls go through NestJS + AdminAuthGuard.

## Install

Copy the contents of this patch into the existing Brandspire POS repository and replace matching files.

No Supabase migration is required for Phase 20. It uses tables and audit infrastructure already present from earlier phases.

Restart:

```powershell
cd C:\BApos\brandspire-pos-starter
npx pnpm@11.24.0 dev
```

Open:

- `http://localhost:3000/admin`
- `http://localhost:3000/admin/organizations`
- `http://localhost:3000/admin/billing`
- `http://localhost:3000/admin/audit`

## Safety test

1. Open one test organization.
2. Suspend it with a reason.
3. Confirm Owner/Staff billing is blocked.
4. If access has not expired, restore it and confirm access returns.
5. Extend access by 3 days and confirm the new end date.
6. Update Admin message and confirm Owner sees it.
7. Open Audit Trail and verify all actions are present.

Use a test tenant for the first suspension test.
